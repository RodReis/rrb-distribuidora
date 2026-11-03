import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  purchaseEvents,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReceipts,
  stockLots,
  stockMovements,
  warehouses,
} from "@/lib/db/schema";
import { recalculatePredictiveMetricsForTenant } from "@/lib/stock/predictive-engine";
import { isUniqueViolation } from "@/lib/stock/remnant-code";
import { unitCostToCostPerKg } from "@/lib/stock/units";
import { requirePurchaseCapability } from "./capabilities";
import { purchaseConflict, purchaseNotFound, purchaseValidation } from "./errors";
import { openQuantity, roundMoney, roundQuantity, type PurchaseQuantityLike } from "./pricing";
import { purchaseNumberLabel } from "./service";
import { canReceive, PURCHASE_STATUS_LABEL } from "./state-machine";
import type { ProductUnit, PurchaseStatus } from "./types";

/**
 * Recebimento e estorno contra pedido de compra (LAC-01 US-06).
 *
 * Regras que vivem aqui:
 * - só PC `emitido`/`parcialmente_recebido` recebe, nunca excluído;
 * - item tem de pertencer ao PC/tenant e a quantidade não pode passar do saldo aberto
 *   (esta versão NÃO aceita excesso — decisão de tolerância está fora da SPEC);
 * - lote + movimento `ENTRADA_COMPRA` + `purchase_receipts` + saldo do item + estado do
 *   pedido são gravados na MESMA transação, com `FOR UPDATE` no pedido e no item;
 * - `(tenant, idempotency_key)` evita lote/movimento duplicado em retry;
 * - estorno não apaga nada: marca o recebimento, devolve a quantidade do lote com
 *   movimento compensatório `ESTORNO_COMPRA` e recalcula o estado do pedido.
 *
 * Nenhuma rota pode mexer em estoque por conta própria: as rotas só validam formato,
 * checam capability e chamam este módulo.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Formata quantidade para mensagem de erro acionável em PT-BR. */
function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(roundQuantity(value));
}

function parseReceivedAt(value: string | null | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw purchaseValidation("Data de recebimento inválida.");
  }
  return date;
}

function roundUnitCost(value: number): number {
  const rounded = Number(Number(value).toFixed(4));
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw purchaseValidation("Custo unitário recebido deve ser maior que zero.");
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Regras puras (testáveis sem banco)
// ---------------------------------------------------------------------------

/**
 * Valida a quantidade recebida contra o saldo aberto do item e devolve a quantidade
 * normalizada. Não existe tolerância nesta versão: qualquer excesso é rejeitado.
 */
export function assertReceiptWithinOpenQuantity(
  item: PurchaseQuantityLike,
  quantity: number
): number {
  const requested = roundQuantity(Number(quantity));
  if (!Number.isFinite(requested) || requested <= 0) {
    throw purchaseValidation("Quantidade recebida deve ser maior que zero.");
  }

  const open = openQuantity(item);
  if (requested > open) {
    throw purchaseValidation(
      `Quantidade recebida (${formatQuantity(requested)}) acima do saldo aberto do item (${formatQuantity(open)}). ` +
        "Recebimento em excesso não é aceito nesta versão.",
      { openQuantity: open, requestedQuantity: requested }
    );
  }

  return requested;
}

/** Estado do PC depois de registrar um recebimento (todos os itens completos ou não). */
export function deriveStatusAfterReceipt(items: PurchaseQuantityLike[]): PurchaseStatus {
  const complete = items.length > 0 && items.every((item) => openQuantity(item) <= 0);
  return complete ? "recebido_completo" : "parcialmente_recebido";
}

/**
 * Estado do PC depois de estornar um recebimento: sem nenhuma quantidade recebida o
 * pedido volta a `emitido`; caso contrário continua parcial ou completo.
 */
export function deriveStatusAfterReversal(items: PurchaseQuantityLike[]): PurchaseStatus {
  const anyReceived = items.some((item) => roundQuantity(Number(item.quantityReceived)) > 0);
  if (!anyReceived) return "emitido";
  return deriveStatusAfterReceipt(items);
}

/** `quantity_received` do item depois de somar um recebimento. */
export function receivedQuantityAfterReceipt(current: unknown, quantity: number): number {
  return roundQuantity(Number(current) + roundQuantity(Number(quantity)));
}

/** `quantity_received` do item depois de descontar um estorno (nunca negativo). */
export function receivedQuantityAfterReversal(current: unknown, quantity: number): number {
  const next = roundQuantity(Number(current) - roundQuantity(Number(quantity)));
  if (!Number.isFinite(next) || next < 0) {
    throw purchaseConflict(
      "O estorno deixaria a quantidade recebida do item negativa. Verifique os recebimentos antes de estornar."
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface PurchaseReceiptInput {
  itemId: string;
  warehouseId: string;
  quantity: number;
  lotNumber: string;
  heatNumber?: string | null;
  unitCost: number;
  locationAddress?: string | null;
  receivedAt?: string | null;
  supplierDocumentReference?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}

export interface PurchaseReceiptDto {
  id: string;
  purchaseOrderId: string;
  purchaseOrderItemId: string;
  purchaseOrderNumber: number | null;
  /** Rótulo exibido/gravado como referência: `#PC-0001` (ou `Rascunho`). */
  purchaseOrderNumberLabel: string;
  lotId: string;
  lotNumber: string;
  warehouseId: string;
  quantity: number;
  unit: ProductUnit;
  unitCost: number;
  receivedAt: string;
  supplierDocumentReference: string | null;
  receivedBy: string;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  purchaseOrderStatus: PurchaseStatus;
  purchaseOrderStatusLabel: string;
  itemQuantityOrdered: number;
  itemQuantityReceived: number;
  itemQuantityOpen: number;
  createdAt: string;
}

type ReceiptRow = typeof purchaseReceipts.$inferSelect;

// ---------------------------------------------------------------------------
// Leitura auxiliar
// ---------------------------------------------------------------------------

async function findReceiptByKey(tenantId: string, key: string): Promise<ReceiptRow | null> {
  const [row] = await db
    .select()
    .from(purchaseReceipts)
    .where(and(eq(purchaseReceipts.tenantId, tenantId), eq(purchaseReceipts.idempotencyKey, key)))
    .limit(1);
  return row ?? null;
}

async function findReceiptRow(tenantId: string, receiptId: string): Promise<ReceiptRow | null> {
  const [row] = await db
    .select()
    .from(purchaseReceipts)
    .where(and(eq(purchaseReceipts.id, receiptId), eq(purchaseReceipts.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

async function findEventByKey(tenantId: string, key: string) {
  const [event] = await db
    .select()
    .from(purchaseEvents)
    .where(and(eq(purchaseEvents.tenantId, tenantId), eq(purchaseEvents.idempotencyKey, key)))
    .limit(1);
  return event ?? null;
}

/** Monta o resultado devolvido pela API a partir do recebimento persistido. */
async function loadReceiptDto(tenantId: string, receiptId: string): Promise<PurchaseReceiptDto> {
  const [row] = await db
    .select({
      receipt: purchaseReceipts,
      orderNumber: purchaseOrders.number,
      orderStatus: purchaseOrders.status,
      itemQuantityOrdered: purchaseOrderItems.quantityOrdered,
      itemQuantityReceived: purchaseOrderItems.quantityReceived,
      lotNumber: stockLots.lotNumber,
    })
    .from(purchaseReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReceipts.purchaseOrderId))
    .innerJoin(purchaseOrderItems, eq(purchaseOrderItems.id, purchaseReceipts.purchaseOrderItemId))
    .leftJoin(stockLots, eq(stockLots.id, purchaseReceipts.lotId))
    .where(
      and(
        eq(purchaseReceipts.id, receiptId),
        eq(purchaseReceipts.tenantId, tenantId),
        eq(purchaseOrders.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!row) throw purchaseNotFound("Recebimento não encontrado.");

  const item = {
    quantityOrdered: row.itemQuantityOrdered,
    quantityReceived: row.itemQuantityReceived,
  };

  return {
    id: row.receipt.id,
    purchaseOrderId: row.receipt.purchaseOrderId,
    purchaseOrderItemId: row.receipt.purchaseOrderItemId,
    purchaseOrderNumber: row.orderNumber,
    purchaseOrderNumberLabel: purchaseNumberLabel(row.orderNumber),
    lotId: row.receipt.lotId,
    lotNumber: row.lotNumber ?? "—",
    warehouseId: row.receipt.warehouseId,
    quantity: Number(row.receipt.quantity),
    unit: row.receipt.unit,
    unitCost: Number(row.receipt.unitCost),
    receivedAt: row.receipt.receivedAt.toISOString(),
    supplierDocumentReference: row.receipt.supplierDocumentReference,
    receivedBy: row.receipt.receivedBy,
    reversedAt: row.receipt.reversedAt?.toISOString() ?? null,
    reversedBy: row.receipt.reversedBy,
    reversalReason: row.receipt.reversalReason,
    purchaseOrderStatus: row.orderStatus,
    purchaseOrderStatusLabel: PURCHASE_STATUS_LABEL[row.orderStatus],
    itemQuantityOrdered: Number(row.itemQuantityOrdered),
    itemQuantityReceived: Number(row.itemQuantityReceived),
    itemQuantityOpen: openQuantity(item),
    createdAt: row.receipt.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

/**
 * Retry precisa devolver o MESMO resultado; uma mesma chave reaproveitada com outro
 * conteúdo é conflito, não uma segunda gravação silenciosa.
 */
function assertReceiptReplayMatches(
  stored: ReceiptRow,
  purchaseOrderId: string,
  input: PurchaseReceiptInput
): void {
  if (stored.purchaseOrderId !== purchaseOrderId) {
    throw purchaseConflict("Chave de idempotência já usada em outro pedido de compra.");
  }
  if (stored.purchaseOrderItemId !== input.itemId) {
    throw purchaseConflict(
      "Chave de idempotência já usada para outro item. Use uma nova chave para receber outro item."
    );
  }
  if (stored.warehouseId !== input.warehouseId) {
    throw purchaseConflict("Chave de idempotência já usada com outro depósito.");
  }
  if (roundQuantity(Number(stored.quantity)) !== roundQuantity(Number(input.quantity))) {
    throw purchaseConflict(
      "Chave de idempotência já usada com quantidade diferente. Reenvie a mesma requisição ou use uma nova chave."
    );
  }
}

function isReceiptIdempotencyViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const constraint = (error as { constraint?: string; cause?: { constraint?: string } }).constraint;
  const causeConstraint = (error as { cause?: { constraint?: string } }).cause?.constraint;
  const name = constraint ?? causeConstraint;
  // Sem o nome da constraint (driver embrulha), dentro desta transação a única
  // unicidade possível é a da chave de idempotência do recebimento/evento.
  return (
    !name ||
    name === "purchase_receipts_tenant_idem_uq" ||
    name === "uq_purchase_events_tenant_idem"
  );
}

function assertReversalReplayMatches(
  event: typeof purchaseEvents.$inferSelect,
  receiptId: string
): void {
  const payload = (event.payload ?? {}) as { receiptId?: unknown };
  if (event.eventType !== "receipt_reversed" || payload.receiptId !== receiptId) {
    throw purchaseConflict("Chave de idempotência já usada em outra operação.");
  }
}

// ---------------------------------------------------------------------------
// Recebimento
// ---------------------------------------------------------------------------

export interface RegisterPurchaseReceiptParams {
  tenantId: string;
  userId: string;
  role: string;
  purchaseOrderId: string;
  input: PurchaseReceiptInput;
}

/**
 * Registra um recebimento (parcial ou total) contra um PC emitido.
 * Atômico: lote, movimento, recebimento, saldo do item, estado do pedido, evento e
 * auditoria entram na mesma transação. Idempotente por `(tenantId, idempotencyKey)`.
 */
export async function registerPurchaseReceipt(
  params: RegisterPurchaseReceiptParams
): Promise<{ receipt: PurchaseReceiptDto }> {
  requirePurchaseCapability(params.role, "stock.receive_purchase");

  const key = (params.input.idempotencyKey ?? "").trim();
  if (!key) throw purchaseValidation("Informe a chave de idempotência do recebimento.");

  // Retry comum: devolve o mesmo recebimento antes de abrir transação.
  const replay = await findReceiptByKey(params.tenantId, key);
  if (replay) {
    assertReceiptReplayMatches(replay, params.purchaseOrderId, params.input);
    return { receipt: await loadReceiptDto(params.tenantId, replay.id) };
  }

  let outcome: { id: string; created: boolean };
  try {
    outcome = await db.transaction(async (tx) => {
      // 1. Bloqueia o pedido: recebimentos concorrentes do mesmo PC são serializados aqui.
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, params.purchaseOrderId),
            eq(purchaseOrders.tenantId, params.tenantId)
          )
        )
        .for("update");

      if (!order || order.deletedAt) throw purchaseNotFound();

      // Recheca a chave já sob lock: dois retries simultâneos não criam dois lotes.
      const [duplicate] = await tx
        .select()
        .from(purchaseReceipts)
        .where(
          and(
            eq(purchaseReceipts.tenantId, params.tenantId),
            eq(purchaseReceipts.idempotencyKey, key)
          )
        )
        .limit(1);
      if (duplicate) {
        assertReceiptReplayMatches(duplicate, params.purchaseOrderId, params.input);
        return { id: duplicate.id, created: false };
      }

      if (!canReceive(order.status)) {
        throw purchaseConflict(
          `Pedido ${PURCHASE_STATUS_LABEL[order.status].toLowerCase()} não aceita recebimento. ` +
            "Somente pedido emitido ou parcialmente recebido pode ser recebido."
        );
      }

      // 2. Bloqueia o item e valida que ele pertence a este PC/tenant.
      const [item] = await tx
        .select()
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.id, params.input.itemId),
            eq(purchaseOrderItems.tenantId, params.tenantId),
            eq(purchaseOrderItems.purchaseOrderId, order.id)
          )
        )
        .for("update");

      if (!item) {
        throw purchaseValidation("O item informado não pertence a este pedido de compra.");
      }

      const quantity = assertReceiptWithinOpenQuantity(item, params.input.quantity);
      const unitCost = roundUnitCost(params.input.unitCost);
      const receivedAt = parseReceivedAt(params.input.receivedAt);

      const lotNumber = (params.input.lotNumber ?? "").trim();
      if (!lotNumber) throw purchaseValidation("Informe o lote/corrida do recebimento.");

      const [warehouse] = await tx
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(eq(warehouses.id, params.input.warehouseId), eq(warehouses.tenantId, params.tenantId))
        )
        .limit(1);
      if (!warehouse) throw purchaseValidation("Depósito não encontrado neste tenant.");

      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.tenantId, params.tenantId)))
        .limit(1);
      if (!product) throw purchaseConflict("Produto do item não encontrado neste tenant.");

      const heatNumber = params.input.heatNumber?.trim() || null;
      const locationAddress = params.input.locationAddress?.trim() || "Galpão Central";
      const supplierDocumentReference = params.input.supplierDocumentReference?.trim() || null;
      const notes = params.input.notes?.trim() || null;

      // 3. Lote de estoque: fornecedor vem do próprio PC, nunca inferido.
      const [lot] = await tx
        .insert(stockLots)
        .values({
          tenantId: params.tenantId,
          productId: item.productId,
          warehouseId: warehouse.id,
          lotNumber,
          heatNumber,
          supplierId: order.supplierId,
          quantityInitial: quantity.toFixed(4),
          quantityCurrent: quantity.toFixed(4),
          unitCost: unitCost.toFixed(4),
          locationAddress,
          status: "ativo",
        })
        .returning();

      const referenceDocument = purchaseNumberLabel(order.number);
      const totalCost = roundMoney(quantity * unitCost);

      // 4. Movimento de entrada com referência obrigatória ao PC.
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: params.tenantId,
          productId: item.productId,
          lotId: lot.id,
          warehouseId: warehouse.id,
          movementType: "ENTRADA_COMPRA",
          quantity: quantity.toFixed(4),
          unitCost: unitCost.toFixed(4),
          totalCost: totalCost.toFixed(2),
          referenceDocument,
          notes: [`Recebimento ${referenceDocument} — lote ${lotNumber}`, notes]
            .filter(Boolean)
            .join(" | "),
          createdBy: params.userId,
        })
        .returning();

      // 5. Recebimento persistido (é a fonte da idempotência).
      const [receipt] = await tx
        .insert(purchaseReceipts)
        .values({
          tenantId: params.tenantId,
          purchaseOrderId: order.id,
          purchaseOrderItemId: item.id,
          lotId: lot.id,
          warehouseId: warehouse.id,
          quantity: quantity.toFixed(4),
          unit: item.unit,
          unitCost: unitCost.toFixed(4),
          receivedAt,
          supplierDocumentReference,
          receivedBy: params.userId,
          idempotencyKey: key,
        })
        .returning();

      // 6. Saldo do item.
      const nextReceived = receivedQuantityAfterReceipt(item.quantityReceived, quantity);
      await tx
        .update(purchaseOrderItems)
        .set({ quantityReceived: nextReceived.toFixed(4), updatedAt: new Date() })
        .where(eq(purchaseOrderItems.id, item.id));

      // 7. Estado do pedido conforme o saldo aberto de TODOS os itens.
      const itemRows = await tx
        .select({
          quantityOrdered: purchaseOrderItems.quantityOrdered,
          quantityReceived: purchaseOrderItems.quantityReceived,
        })
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.purchaseOrderId, order.id),
            eq(purchaseOrderItems.tenantId, params.tenantId)
          )
        );
      const nextStatus = deriveStatusAfterReceipt(itemRows);

      await tx
        .update(purchaseOrders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, order.id));

      // 8. Custo de reposição base (R$/kg), como o M2 faz. A unidade usada na conversão
      // é a congelada no item do pedido, a mesma do custo informado no recebimento.
      const costPerKg = unitCostToCostPerKg(unitCost, { ...product, unit: item.unit });
      if (costPerKg !== null && costPerKg > 0) {
        await tx
          .update(products)
          .set({ replacementCostBase: String(costPerKg), updatedAt: new Date() })
          .where(eq(products.id, product.id));
      }

      // 9. Trilha do domínio + auditoria inviolável.
      await tx.insert(purchaseEvents).values({
        tenantId: params.tenantId,
        purchaseOrderId: order.id,
        itemId: item.id,
        eventType: "received",
        actorUserId: params.userId,
        idempotencyKey: key,
        payload: {
          receiptId: receipt.id,
          movementId: movement.id,
          lotId: lot.id,
          lotNumber,
          heatNumber,
          quantity,
          unit: item.unit,
          unitCost,
          totalCost,
          warehouseId: warehouse.id,
          supplierDocumentReference,
          receivedAt: receivedAt.toISOString(),
          previousStatus: order.status,
          status: nextStatus,
          notes,
        },
      });

      await tx.insert(auditLog).values([
        {
          tenantId: params.tenantId,
          userId: params.userId,
          entity: "stock_lots",
          entityId: lot.id,
          action: "insert",
          after: {
            lotNumber,
            heatNumber,
            quantity,
            unitCost,
            warehouseId: warehouse.id,
            supplierId: order.supplierId,
            purchaseOrderId: order.id,
            referenceDocument,
          },
        },
        {
          tenantId: params.tenantId,
          userId: params.userId,
          entity: "purchase_orders",
          entityId: order.id,
          action: "update",
          before: { status: order.status },
          after: { status: nextStatus, receiptId: receipt.id, lotId: lot.id, quantity },
        },
      ]);

      return { id: receipt.id, created: true };
    });
  } catch (error) {
    // Corrida de retry idempotente: a outra requisição venceu a constraint.
    if (!isReceiptIdempotencyViolation(error)) throw error;
    const raced = await findReceiptByKey(params.tenantId, key);
    if (raced) {
      assertReceiptReplayMatches(raced, params.purchaseOrderId, params.input);
      outcome = { id: raced.id, created: false };
    } else {
      // A chave já pertence a outra ação (ex.: estorno): não é uma repetição deste
      // recebimento, então responde conflito em vez de vazar o erro cru do Postgres.
      const conflictingEvent = await findEventByKey(params.tenantId, key);
      if (conflictingEvent) {
        throw purchaseConflict(
          "Chave de idempotência já usada em outra operação. Use uma nova chave para este recebimento."
        );
      }
      throw error;
    }
  }

  if (outcome.created) {
    // Depois do commit: métricas não podem derrubar o recebimento já persistido.
    try {
      await recalculatePredictiveMetricsForTenant(params.tenantId);
    } catch (error) {
      console.error("Erro ao atualizar métricas preditivas pós recebimento:", error);
    }
  }

  return { receipt: await loadReceiptDto(params.tenantId, outcome.id) };
}

// ---------------------------------------------------------------------------
// Estorno
// ---------------------------------------------------------------------------

export interface ReversePurchaseReceiptParams {
  tenantId: string;
  userId: string;
  role: string;
  receiptId: string;
  reason: string;
  idempotencyKey: string;
}

/**
 * Estorna um recebimento sem apagar histórico: marca o recebimento, cria movimento
 * compensatório negativo, devolve a quantidade do lote, desconta o saldo do item e
 * recalcula o estado do pedido.
 */
export async function reversePurchaseReceipt(
  params: ReversePurchaseReceiptParams
): Promise<{ receipt: PurchaseReceiptDto }> {
  requirePurchaseCapability(params.role, "stock.receive_purchase");

  const reason = (params.reason ?? "").trim();
  if (reason.length < 5) {
    throw purchaseValidation("Justificativa obrigatória para estorno (mínimo 5 caracteres).");
  }

  const key = (params.idempotencyKey ?? "").trim();
  if (!key) throw purchaseValidation("Informe a chave de idempotência do estorno.");

  // Retry comum: mesma chave devolve o mesmo estorno, sem segundo movimento.
  const replayEvent = await findEventByKey(params.tenantId, key);
  if (replayEvent) {
    assertReversalReplayMatches(replayEvent, params.receiptId);
    return { receipt: await loadReceiptDto(params.tenantId, params.receiptId) };
  }

  const stored = await findReceiptRow(params.tenantId, params.receiptId);
  if (!stored) throw purchaseNotFound("Recebimento não encontrado.");

  try {
    await db.transaction(async (tx) => {
      // 1. Bloqueia o pedido antes de qualquer leitura: serializa com recebimentos.
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, stored.purchaseOrderId),
            eq(purchaseOrders.tenantId, params.tenantId)
          )
        )
        .for("update");
      if (!order || order.deletedAt) throw purchaseNotFound();

      // 2. Bloqueia o recebimento.
      const [receipt] = await tx
        .select()
        .from(purchaseReceipts)
        .where(
          and(
            eq(purchaseReceipts.id, params.receiptId),
            eq(purchaseReceipts.tenantId, params.tenantId)
          )
        )
        .for("update");
      if (!receipt) throw purchaseNotFound("Recebimento não encontrado.");

      // Recheca a chave sob lock (duas requisições de estorno simultâneas).
      const [duplicateEvent] = await tx
        .select()
        .from(purchaseEvents)
        .where(
          and(eq(purchaseEvents.tenantId, params.tenantId), eq(purchaseEvents.idempotencyKey, key))
        )
        .limit(1);
      if (duplicateEvent) {
        assertReversalReplayMatches(duplicateEvent, params.receiptId);
        return;
      }

      if (receipt.reversedAt) {
        throw purchaseConflict(
          `Este recebimento já foi estornado em ${receipt.reversedAt.toISOString()}. Recarregue o pedido.`
        );
      }

      // 3. Item e lote de origem (ambos presos por lock para o saldo não mudar embaixo).
      const [item] = await tx
        .select()
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.id, receipt.purchaseOrderItemId),
            eq(purchaseOrderItems.tenantId, params.tenantId)
          )
        )
        .for("update");
      if (!item) throw purchaseConflict("Item do recebimento não encontrado no pedido.");

      const [lot] = await tx
        .select()
        .from(stockLots)
        .where(and(eq(stockLots.id, receipt.lotId), eq(stockLots.tenantId, params.tenantId)))
        .for("update");
      if (!lot) {
        throw purchaseConflict(
          "Lote de origem do recebimento não encontrado. O estorno não pode ser registrado."
        );
      }

      const quantity = roundQuantity(Number(receipt.quantity));
      const unitCost = Number(receipt.unitCost);
      const currentQuantity = roundQuantity(Number(lot.quantityCurrent));
      const nextQuantity = roundQuantity(currentQuantity - quantity);

      if (nextQuantity < 0) {
        throw purchaseConflict(
          `O lote ${lot.lotNumber} já foi consumido: saldo atual ${formatQuantity(currentQuantity)}, ` +
            `insuficiente para estornar ${formatQuantity(quantity)}. Ajuste o inventário antes de estornar.`
        );
      }

      // 4. Devolve a quantidade do lote (o estorno retira do estoque o que entrou).
      const nextLotStatus =
        nextQuantity === 0 ? "esgotado" : lot.status === "esgotado" ? "ativo" : lot.status;
      await tx
        .update(stockLots)
        .set({ quantityCurrent: nextQuantity.toFixed(4), status: nextLotStatus })
        .where(eq(stockLots.id, lot.id));

      const referenceDocument = purchaseNumberLabel(order.number);
      const totalCost = roundMoney(quantity * unitCost);

      // 5. Movimento compensatório negativo, referenciando o PC e o recebimento.
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: params.tenantId,
          productId: item.productId,
          lotId: lot.id,
          warehouseId: receipt.warehouseId,
          movementType: "ESTORNO_COMPRA",
          quantity: (-quantity).toFixed(4),
          unitCost: unitCost.toFixed(4),
          totalCost: totalCost.toFixed(2),
          referenceDocument,
          notes: `Estorno do recebimento ${receipt.id} — ${reason}`,
          createdBy: params.userId,
        })
        .returning();

      // 6. Marca o recebimento (nada é apagado).
      const reversedAt = new Date();
      await tx
        .update(purchaseReceipts)
        .set({ reversedAt, reversedBy: params.userId, reversalReason: reason })
        .where(eq(purchaseReceipts.id, receipt.id));

      // 7. Desconta o saldo recebido do item.
      const nextReceived = receivedQuantityAfterReversal(item.quantityReceived, quantity);
      await tx
        .update(purchaseOrderItems)
        .set({ quantityReceived: nextReceived.toFixed(4), updatedAt: new Date() })
        .where(eq(purchaseOrderItems.id, item.id));

      // 8. Recalcula o estado do pedido (sem recebimento volta a `emitido`).
      const itemRows = await tx
        .select({
          quantityOrdered: purchaseOrderItems.quantityOrdered,
          quantityReceived: purchaseOrderItems.quantityReceived,
        })
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.purchaseOrderId, order.id),
            eq(purchaseOrderItems.tenantId, params.tenantId)
          )
        );
      const nextStatus = deriveStatusAfterReversal(itemRows);

      await tx
        .update(purchaseOrders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, order.id));

      // 9. Evento + auditoria (recebimento, lote e pedido).
      await tx.insert(purchaseEvents).values({
        tenantId: params.tenantId,
        purchaseOrderId: order.id,
        itemId: item.id,
        eventType: "receipt_reversed",
        actorUserId: params.userId,
        idempotencyKey: key,
        payload: {
          receiptId: receipt.id,
          movementId: movement.id,
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          quantity,
          unitCost,
          totalCost,
          reason,
          previousStatus: order.status,
          status: nextStatus,
          lotQuantityCurrent: nextQuantity,
        },
      });

      await tx.insert(auditLog).values([
        {
          tenantId: params.tenantId,
          userId: params.userId,
          entity: "purchase_receipts",
          entityId: receipt.id,
          action: "update",
          before: { reversedAt: null },
          after: { reversedAt: reversedAt.toISOString(), reversalReason: reason },
        },
        {
          tenantId: params.tenantId,
          userId: params.userId,
          entity: "stock_lots",
          entityId: lot.id,
          action: "update",
          before: { quantityCurrent: currentQuantity, status: lot.status },
          after: { quantityCurrent: nextQuantity, status: nextLotStatus },
        },
        {
          tenantId: params.tenantId,
          userId: params.userId,
          entity: "purchase_orders",
          entityId: order.id,
          action: "update",
          before: { status: order.status },
          after: { status: nextStatus, receiptId: receipt.id },
        },
      ]);
    });
  } catch (error) {
    // Corrida com outra operação usando a mesma chave de idempotência.
    if (isUniqueViolation(error)) {
      const raced = await findEventByKey(params.tenantId, key);
      if (raced) {
        assertReversalReplayMatches(raced, params.receiptId);
        return { receipt: await loadReceiptDto(params.tenantId, params.receiptId) };
      }
      throw purchaseConflict(
        "Chave de idempotência já usada em outra operação. Use uma nova chave."
      );
    }
    throw error;
  }

  try {
    await recalculatePredictiveMetricsForTenant(params.tenantId);
  } catch (error) {
    console.error("Erro ao atualizar métricas preditivas pós estorno:", error);
  }

  return { receipt: await loadReceiptDto(params.tenantId, params.receiptId) };
}
