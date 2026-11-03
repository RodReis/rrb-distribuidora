import { and, asc, count, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  purchaseApprovals,
  purchaseEvents,
  purchaseOrderItems,
  purchaseOrderVersions,
  purchaseOrders,
  purchaseReceipts,
  stockLots,
  suppliers,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import {
  ActiveApprovalRule,
  assertMatrixHasNoGap,
  listActiveApprovalRules,
  resolveApprovalRule,
  ruleAllowsApprover,
} from "./approval-rules";
import { getPurchaseCapabilities, requirePurchaseCapability } from "./capabilities";
import {
  purchaseConflict,
  purchaseForbidden,
  purchaseNotFound,
  purchaseValidation,
} from "./errors";
import { buildPurchaseContent, hashPurchaseContent } from "./hash";
import {
  computePurchaseLine,
  computePurchaseTotals,
  openQuantity,
  receivedPercentage,
  roundMoney,
  roundQuantity,
  type ComputedLine,
} from "./pricing";
import {
  canReceive,
  canTransitionPurchase,
  isEditable,
  PURCHASE_STATUS_LABEL,
} from "./state-machine";
import { PURCHASE_STATUSES } from "./state-machine";
import type {
  PurchaseCapability,
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderListRow,
  PurchaseOrderSummary,
  PurchaseStatus,
} from "./types";

/**
 * Serviço de compras operacionais (LAC-01).
 *
 * Toda regra de estado, alçada, versão/hash e segregação vive aqui. As rotas só
 * autenticam, validam o formato (zod) e chamam este módulo — nenhuma rota pode
 * emitir, aprovar ou mexer em estoque por conta própria.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function purchaseNumberLabel(number: number | null | undefined): string {
  if (!number) return "Rascunho";
  return `#PC-${String(number).padStart(4, "0")}`;
}

function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw purchaseValidation(`Data inválida em "${field}".`);
  }
  return date;
}

// ---------------------------------------------------------------------------
// Carga e validação de catálogo
// ---------------------------------------------------------------------------

async function loadSupplierOrThrow(tenantId: string, supplierId: string) {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId)))
    .limit(1);

  if (!supplier) throw purchaseValidation("Fornecedor não encontrado neste tenant.");
  if (!supplier.active) throw purchaseValidation("Fornecedor inativo não pode receber pedido.");
  return supplier;
}

async function loadProductsOrThrow(tenantId: string, productIds: string[]) {
  const unique = Array.from(new Set(productIds));
  if (!unique.length) throw purchaseValidation("Inclua ao menos um item no pedido.");

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, unique)));

  if (rows.length !== unique.length) {
    throw purchaseValidation("Há produto inexistente ou de outro tenant no pedido.");
  }

  const map = new Map(rows.map((row) => [row.id, row]));
  for (const product of rows) {
    if (product.status !== "ativo") {
      throw purchaseValidation(`Produto ${product.sku} não está ativo.`);
    }
  }
  return map;
}

interface PreparedItem {
  productId: string;
  unit: (typeof products.$inferSelect)["unit"];
  description: string;
  computed: ComputedLine;
  notes: string | null;
}

function prepareItems(
  payload: PurchaseOrderInput,
  productMap: Map<string, typeof products.$inferSelect>
): PreparedItem[] {
  return payload.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw purchaseValidation("Produto do pedido não encontrado neste tenant.");

    const computed = computePurchaseLine({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      additionalCosts: item.additionalCosts,
    });

    if (computed.lineTotal < 0) {
      throw purchaseValidation(
        `Item ${product.sku}: desconto/custos deixam o total da linha negativo.`
      );
    }

    return {
      productId: product.id,
      unit: product.unit,
      description: item.description?.trim() || product.commercialDescription,
      computed,
      notes: item.notes?.trim() || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Eventos e auditoria
// ---------------------------------------------------------------------------

interface EventInput {
  tenantId: string;
  purchaseOrderId: string;
  itemId?: string | null;
  eventType: (typeof purchaseEvents.$inferInsert)["eventType"];
  actorUserId: string | null;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

async function logEvent(tx: Tx, input: EventInput) {
  const [event] = await tx
    .insert(purchaseEvents)
    .values({
      tenantId: input.tenantId,
      purchaseOrderId: input.purchaseOrderId,
      itemId: input.itemId ?? null,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      payload: input.payload ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();
  return event;
}

async function logAudit(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string | null;
    action: "insert" | "update" | "delete";
    entityId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await tx.insert(auditLog).values({
    tenantId: input.tenantId,
    userId: input.userId,
    entity: "purchase_orders",
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

async function findEventByKey(tenantId: string, key: string) {
  const [event] = await db
    .select()
    .from(purchaseEvents)
    .where(and(eq(purchaseEvents.tenantId, tenantId), eq(purchaseEvents.idempotencyKey, key)))
    .limit(1);
  return event ?? null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

async function loadOrderRow(tenantId: string, id: string, client: Tx | typeof db = db) {
  const [row] = await client
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.tenantId, tenantId),
        isNull(purchaseOrders.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

async function loadOrderItems(tenantId: string, orderId: string) {
  return db
    .select({
      item: purchaseOrderItems,
      sku: products.sku,
    })
    .from(purchaseOrderItems)
    .leftJoin(products, eq(products.id, purchaseOrderItems.productId))
    .where(
      and(
        eq(purchaseOrderItems.purchaseOrderId, orderId),
        eq(purchaseOrderItems.tenantId, tenantId)
      )
    )
    .orderBy(asc(purchaseOrderItems.createdAt));
}

/** Conteúdo/hash da versão corrente do pedido (usado na submissão e na emissão). */
function currentContent(
  order: typeof purchaseOrders.$inferSelect,
  items: { item: typeof purchaseOrderItems.$inferSelect }[]
) {
  return buildPurchaseContent({
    supplierId: order.supplierId,
    currency: order.currency,
    expectedDeliveryAt: order.expectedDeliveryAt,
    items: items.map(({ item }) => ({
      productId: item.productId,
      description: item.productDescriptionSnapshot,
      quantity: item.quantityOrdered,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      additionalCosts: item.additionalCosts,
      notes: item.notes,
    })),
  });
}

export async function getPurchaseOrder(input: {
  tenantId: string;
  role: string;
  userId: string;
  id: string;
}): Promise<PurchaseOrderDetail | null> {
  const order = await loadOrderRow(input.tenantId, input.id);
  if (!order) return null;

  const items = await loadOrderItems(input.tenantId, order.id);

  const [supplierRows, versions, approvalRows, eventRows, receiptRows] = await Promise.all([
    db.select().from(suppliers).where(eq(suppliers.id, order.supplierId)).limit(1),
    db
      .select({ version: purchaseOrderVersions, createdByName: users.name })
      .from(purchaseOrderVersions)
      .leftJoin(users, eq(users.id, purchaseOrderVersions.createdBy))
      .where(eq(purchaseOrderVersions.purchaseOrderId, order.id))
      .orderBy(desc(purchaseOrderVersions.version)),
    db
      .select({ approval: purchaseApprovals, actorName: users.name, actorRole: users.role })
      .from(purchaseApprovals)
      .leftJoin(users, eq(users.id, purchaseApprovals.actorUserId))
      .where(eq(purchaseApprovals.purchaseOrderId, order.id))
      .orderBy(desc(purchaseApprovals.decidedAt)),
    db
      .select({ event: purchaseEvents, actorName: users.name })
      .from(purchaseEvents)
      .leftJoin(users, eq(users.id, purchaseEvents.actorUserId))
      .where(eq(purchaseEvents.purchaseOrderId, order.id))
      .orderBy(desc(purchaseEvents.createdAt)),
    db
      .select({
        receipt: purchaseReceipts,
        lotNumber: stockLots.lotNumber,
        warehouseName: warehouses.name,
        productDescription: purchaseOrderItems.productDescriptionSnapshot,
        receivedByName: users.name,
      })
      .from(purchaseReceipts)
      .leftJoin(stockLots, eq(stockLots.id, purchaseReceipts.lotId))
      .leftJoin(warehouses, eq(warehouses.id, purchaseReceipts.warehouseId))
      .leftJoin(purchaseOrderItems, eq(purchaseOrderItems.id, purchaseReceipts.purchaseOrderItemId))
      .leftJoin(users, eq(users.id, purchaseReceipts.receivedBy))
      .where(eq(purchaseReceipts.purchaseOrderId, order.id))
      .orderBy(desc(purchaseReceipts.receivedAt)),
  ]);

  const supplier = supplierRows[0];
  if (!supplier) throw purchaseValidation("Fornecedor do pedido não encontrado.");

  const [creator] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, order.createdBy))
    .limit(1);

  const rule = await resolveApprovalRule(input.tenantId, toNum(order.grandTotal));
  const content = currentContent(order, items);
  const currentHash = hashPurchaseContent(content);
  const approvedApprovals = approvalRows.filter(
    (row) =>
      row.approval.decision === "approved" && row.approval.orderVersion === order.currentVersion
  );

  return {
    order: {
      id: order.id,
      number: order.number,
      numberLabel: purchaseNumberLabel(order.number),
      status: order.status,
      statusLabel: PURCHASE_STATUS_LABEL[order.status],
      currency: order.currency,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      subtotal: toNum(order.subtotal),
      discountTotal: toNum(order.discountTotal),
      additionalCostsTotal: toNum(order.additionalCostsTotal),
      grandTotal: toNum(order.grandTotal),
      currentVersion: order.currentVersion,
      approvedVersionHash: order.approvedVersionHash,
      approvedRuleVersion: order.approvedRuleVersion,
      createdByName: creator?.name ?? null,
      submittedAt: order.submittedAt?.toISOString() ?? null,
      approvedAt: order.approvedAt?.toISOString() ?? null,
      issuedAt: order.issuedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancellationReason: order.cancellationReason,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    },
    supplier: {
      id: supplier.id,
      legalName: supplier.legalName,
      tradeName: supplier.tradeName,
      cnpj: supplier.cnpj,
      city: supplier.city,
      uf: supplier.uf,
      paymentTerms: supplier.paymentTerms,
    },
    items: items.map(({ item, sku }) => ({
      id: item.id,
      productId: item.productId,
      sku: sku ?? "—",
      description: item.productDescriptionSnapshot,
      unit: item.unit,
      quantityOrdered: toNum(item.quantityOrdered),
      quantityReceived: toNum(item.quantityReceived),
      quantityOpen: openQuantity(item),
      unitPrice: toNum(item.unitPrice),
      discountAmount: toNum(item.discountAmount),
      additionalCosts: item.additionalCosts ?? [],
      lineTotal: toNum(item.lineTotal),
      notes: item.notes,
    })),
    versions: versions.map(({ version, createdByName }) => ({
      version: version.version,
      contentHash: version.contentHash,
      createdAt: version.createdAt.toISOString(),
      createdByName,
    })),
    approvals: approvalRows.map(({ approval, actorName, actorRole }) => ({
      id: approval.id,
      orderVersion: approval.orderVersion,
      contentHash: approval.contentHash,
      ruleVersion: approval.ruleVersion,
      decision: approval.decision,
      actorName,
      actorRole: actorRole ?? "—",
      justification: approval.justification,
      decidedAt: approval.decidedAt.toISOString(),
    })),
    events: eventRows.map(({ event, actorName }) => ({
      id: event.id,
      eventType: event.eventType,
      itemId: event.itemId,
      actorName,
      payload: (event.payload as Record<string, unknown> | null) ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    receipts: receiptRows.map((row) => ({
      id: row.receipt.id,
      itemId: row.receipt.purchaseOrderItemId,
      productDescription: row.productDescription ?? "—",
      lotId: row.receipt.lotId,
      lotNumber: row.lotNumber ?? "—",
      warehouseName: row.warehouseName ?? "—",
      quantity: toNum(row.receipt.quantity),
      unit: row.receipt.unit,
      unitCost: toNum(row.receipt.unitCost),
      receivedAt: row.receipt.receivedAt.toISOString(),
      supplierDocumentReference: row.receipt.supplierDocumentReference,
      receivedByName: row.receivedByName,
      reversedAt: row.receipt.reversedAt?.toISOString() ?? null,
      reversalReason: row.receipt.reversalReason,
    })),
    approvalRule: rule
      ? {
          id: rule.id,
          matrixVersion: rule.matrixVersion,
          minTotal: rule.minTotal,
          maxTotal: rule.maxTotal,
          currency: rule.currency,
          approverPermission: rule.approverPermission,
          requiredApprovals: rule.requiredApprovals,
          activeFrom: rule.activeFrom.toISOString(),
          activeUntil: rule.activeUntil?.toISOString() ?? null,
          createdByName: null,
        }
      : null,
    approvalsCount: approvedApprovals.length,
    versionDiverges: !!order.approvedVersionHash && order.approvedVersionHash !== currentHash,
    capabilities: getPurchaseCapabilities(input.role),
  };
}

export interface ListPurchasesFilters {
  status?: string;
  supplierId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listPurchaseOrders(input: {
  tenantId: string;
  role: string;
  userId: string;
  filters?: ListPurchasesFilters;
}): Promise<{
  items: PurchaseOrderListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const filters = input.filters ?? {};
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(purchaseOrders.tenantId, input.tenantId),
    isNull(purchaseOrders.deletedAt),
  ];

  if (filters.status && filters.status !== "todos") {
    if (!PURCHASE_STATUSES.includes(filters.status as PurchaseStatus)) {
      throw purchaseValidation("Estado de pedido inválido no filtro.");
    }
    conditions.push(eq(purchaseOrders.status, filters.status as PurchaseStatus));
  }
  if (filters.supplierId && filters.supplierId !== "todos") {
    conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    const numeric = Number(filters.search.replace(/\D/g, ""));
    const searchConditions = [like(suppliers.legalName, term), like(suppliers.tradeName, term)];
    if (Number.isFinite(numeric) && numeric > 0) {
      searchConditions.push(sql`${purchaseOrders.number} = ${numeric}`);
    }
    const condition = or(...searchConditions);
    if (condition) conditions.push(condition);
  }
  if (filters.from) {
    const from = parseOptionalDate(filters.from, "from");
    if (from) conditions.push(gte(purchaseOrders.createdAt, from));
  }
  if (filters.to) {
    const to = parseOptionalDate(filters.to, "to");
    if (to) conditions.push(lte(purchaseOrders.createdAt, to));
  }

  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select({
        order: purchaseOrders,
        supplierName: suppliers.legalName,
        createdByName: users.name,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
      .where(where)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(where),
  ]);

  const orderIds = rows.map((row) => row.order.id);
  const itemRows = orderIds.length
    ? await db
        .select({
          purchaseOrderId: purchaseOrderItems.purchaseOrderId,
          quantityOrdered: purchaseOrderItems.quantityOrdered,
          quantityReceived: purchaseOrderItems.quantityReceived,
        })
        .from(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.purchaseOrderId, orderIds))
    : [];

  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.purchaseOrderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.purchaseOrderId, list);
  }

  const rules = await listActiveApprovalRules(input.tenantId);
  const canDecide = (total: number) => {
    const rule = rules.find(
      (candidate) =>
        total >= candidate.minTotal && (candidate.maxTotal === null || total < candidate.maxTotal)
    );
    return !!rule && ruleAllowsApprover(rule, input.role);
  };

  return {
    items: rows.map(({ order, supplierName, createdByName }) => {
      const items = itemsByOrder.get(order.id) ?? [];
      const isPending = order.status === "submetido";
      return {
        id: order.id,
        numberLabel: purchaseNumberLabel(order.number),
        number: order.number,
        status: order.status,
        statusLabel: PURCHASE_STATUS_LABEL[order.status],
        supplierId: order.supplierId,
        supplierName,
        grandTotal: toNum(order.grandTotal),
        expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        createdByName,
        itemCount: items.length,
        receivedPct: receivedPercentage(items),
        awaitingMyDecision:
          isPending && order.createdBy !== input.userId && canDecide(toNum(order.grandTotal)),
      };
    }),
    page,
    pageSize,
    total: Number(totals[0]?.total ?? 0),
    totalPages: Math.max(1, Math.ceil(Number(totals[0]?.total ?? 0) / pageSize)),
  };
}

export async function getPurchaseSummary(input: {
  tenantId: string;
  role: string;
  userId: string;
}): Promise<PurchaseOrderSummary> {
  const rows = await db
    .select({
      status: purchaseOrders.status,
      total: count(),
      amount: sql<string>`coalesce(sum(${purchaseOrders.grandTotal}), 0)`,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.tenantId, input.tenantId), isNull(purchaseOrders.deletedAt)))
    .groupBy(purchaseOrders.status);

  const byStatus: Partial<Record<PurchaseStatus, number>> = {};
  let total = 0;
  let openGrandTotal = 0;
  let issuedGrandTotal = 0;

  for (const row of rows) {
    const amount = toNum(row.amount);
    const qty = Number(row.total);
    byStatus[row.status] = qty;
    total += qty;

    if (
      ["rascunho", "submetido", "aprovado", "aguardando_alcada_configurada", "rejeitado"].includes(
        row.status
      )
    ) {
      openGrandTotal += amount;
    }
    if (["emitido", "parcialmente_recebido", "recebido_completo"].includes(row.status)) {
      issuedGrandTotal += amount;
    }
  }

  const pendingOrders = await db
    .select({
      id: purchaseOrders.id,
      grandTotal: purchaseOrders.grandTotal,
      createdBy: purchaseOrders.createdBy,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.tenantId, input.tenantId),
        eq(purchaseOrders.status, "submetido"),
        isNull(purchaseOrders.deletedAt)
      )
    );

  const rules = await listActiveApprovalRules(input.tenantId);
  const pendingApprovalCount = pendingOrders.filter((order) => {
    if (order.createdBy === input.userId) return false;
    const amount = toNum(order.grandTotal);
    const rule = rules.find(
      (candidate) =>
        amount >= candidate.minTotal && (candidate.maxTotal === null || amount < candidate.maxTotal)
    );
    return !!rule && ruleAllowsApprover(rule, input.role);
  }).length;

  return {
    total,
    byStatus,
    openGrandTotal: roundMoney(openGrandTotal),
    issuedGrandTotal: roundMoney(issuedGrandTotal),
    pendingApprovalCount,
    awaitingAlcadaCount: byStatus.aguardando_alcada_configurada ?? 0,
    toReceiveCount: (byStatus.emitido ?? 0) + (byStatus.parcialmente_recebido ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Rascunho: criar / editar / excluir
// ---------------------------------------------------------------------------

export interface CreatePurchaseInput {
  tenantId: string;
  userId: string;
  role: string;
  payload: PurchaseOrderInput;
}

export async function createPurchaseOrder(input: CreatePurchaseInput) {
  requirePurchaseCapability(input.role, "purchase.create");

  const supplier = await loadSupplierOrThrow(input.tenantId, input.payload.supplierId);
  const productMap = await loadProductsOrThrow(
    input.tenantId,
    input.payload.items.map((item) => item.productId)
  );
  const prepared = prepareItems(input.payload, productMap);
  const totals = computePurchaseTotals(prepared.map((item) => item.computed));
  const expectedDeliveryAt = parseOptionalDate(
    input.payload.expectedDeliveryAt,
    "expectedDeliveryAt"
  );

  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        tenantId: input.tenantId,
        supplierId: supplier.id,
        status: "rascunho",
        currency: "BRL",
        expectedDeliveryAt,
        subtotal: totals.subtotal.toFixed(2),
        discountTotal: totals.discountTotal.toFixed(2),
        additionalCostsTotal: totals.additionalCostsTotal.toFixed(2),
        grandTotal: totals.grandTotal.toFixed(2),
        createdBy: input.userId,
      })
      .returning();

    await tx.insert(purchaseOrderItems).values(
      prepared.map((item) => ({
        tenantId: input.tenantId,
        purchaseOrderId: order.id,
        productId: item.productId,
        productDescriptionSnapshot: item.description,
        quantityOrdered: item.computed.quantity.toFixed(4),
        unit: item.unit,
        unitPrice: item.computed.unitPrice.toFixed(4),
        discountAmount: item.computed.discountAmount.toFixed(4),
        additionalCosts: item.computed.additionalCosts,
        lineTotal: item.computed.lineTotal.toFixed(2),
        notes: item.notes,
      }))
    );

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: order.id,
      eventType: "created",
      actorUserId: input.userId,
      payload: { grandTotal: totals.grandTotal, items: prepared.length },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "insert",
      entityId: order.id,
      after: { supplierId: supplier.id, grandTotal: totals.grandTotal },
    });

    return order;
  });

  const detail = await getPurchaseOrder({
    tenantId: input.tenantId,
    role: input.role,
    userId: input.userId,
    id: created.id,
  });
  if (!detail) throw purchaseNotFound();
  return detail;
}

export interface UpdatePurchaseInput {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  payload: PurchaseOrderInput;
}

export async function updatePurchaseOrder(input: UpdatePurchaseInput) {
  requirePurchaseCapability(input.role, "purchase.edit");
  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();
  if (!isEditable(existing.status)) {
    throw purchaseConflict(
      `Pedido ${PURCHASE_STATUS_LABEL[existing.status].toLowerCase()} não pode ser editado.`
    );
  }

  const supplier = await loadSupplierOrThrow(input.tenantId, input.payload.supplierId);
  const productMap = await loadProductsOrThrow(
    input.tenantId,
    input.payload.items.map((item) => item.productId)
  );
  const prepared = prepareItems(input.payload, productMap);
  const totals = computePurchaseTotals(prepared.map((item) => item.computed));
  const expectedDeliveryAt = parseOptionalDate(
    input.payload.expectedDeliveryAt,
    "expectedDeliveryAt"
  );

  const invalidatedApproval = existing.status === "aprovado";

  await db.transaction(async (tx) => {
    // Bloqueia a linha: edição concorrente com submissão/aprovação não pode vencer em silêncio.
    const [locked] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)))
      .for("update");

    if (!locked) throw purchaseNotFound();
    if (!isEditable(locked.status)) {
      throw purchaseConflict("O pedido mudou de estado e não pode mais ser editado.");
    }

    await tx
      .update(purchaseOrders)
      .set({
        supplierId: supplier.id,
        expectedDeliveryAt,
        subtotal: totals.subtotal.toFixed(2),
        discountTotal: totals.discountTotal.toFixed(2),
        additionalCostsTotal: totals.additionalCostsTotal.toFixed(2),
        grandTotal: totals.grandTotal.toFixed(2),
        // Qualquer edição material é uma nova rodada: aprovação anterior deixa de valer.
        status: "rascunho",
        approvedVersionHash: null,
        approvedRuleVersion: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.id));

    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, input.id));

    await tx.insert(purchaseOrderItems).values(
      prepared.map((item) => ({
        tenantId: input.tenantId,
        purchaseOrderId: input.id,
        productId: item.productId,
        productDescriptionSnapshot: item.description,
        quantityOrdered: item.computed.quantity.toFixed(4),
        unit: item.unit,
        unitPrice: item.computed.unitPrice.toFixed(4),
        discountAmount: item.computed.discountAmount.toFixed(4),
        additionalCosts: item.computed.additionalCosts,
        lineTotal: item.computed.lineTotal.toFixed(2),
        notes: item.notes,
      }))
    );

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "updated",
      actorUserId: input.userId,
      payload: {
        grandTotal: totals.grandTotal,
        previousStatus: existing.status,
        invalidatedApproval,
      },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "update",
      entityId: input.id,
      before: { status: existing.status, grandTotal: toNum(existing.grandTotal) },
      after: { status: "rascunho", grandTotal: totals.grandTotal, invalidatedApproval },
    });
  });

  const detail = await getPurchaseOrder({
    tenantId: input.tenantId,
    role: input.role,
    userId: input.userId,
    id: input.id,
  });
  if (!detail) throw purchaseNotFound();
  return detail;
}

export async function deletePurchaseDraft(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
}) {
  requirePurchaseCapability(input.role, "purchase.edit");
  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();
  if (existing.status !== "rascunho") {
    throw purchaseConflict(
      "Somente rascunhos podem ser excluídos. Cancele o pedido para encerrá-lo."
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ deletedAt: new Date(), deletedBy: input.userId, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)));

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "deleted",
      actorUserId: input.userId,
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "delete",
      entityId: input.id,
      before: { status: existing.status },
    });
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Submissão
// ---------------------------------------------------------------------------

export async function submitPurchaseOrder(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  idempotencyKey?: string | null;
}) {
  requirePurchaseCapability(input.role, "purchase.submit");

  if (input.idempotencyKey) {
    const event = await findEventByKey(input.tenantId, input.idempotencyKey);
    if (event) {
      if (event.purchaseOrderId !== input.id) {
        throw purchaseConflict("Chave de idempotência já usada em outro pedido.");
      }
      const detail = await getPurchaseOrder(input);
      if (!detail) throw purchaseNotFound();
      return detail;
    }
  }

  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();

  const submittable: PurchaseStatus[] = ["rascunho", "rejeitado", "aguardando_alcada_configurada"];
  if (!submittable.includes(existing.status)) {
    throw purchaseConflict(
      `Pedido ${PURCHASE_STATUS_LABEL[existing.status].toLowerCase()} não pode ser submetido.`
    );
  }

  const items = await loadOrderItems(input.tenantId, existing.id);
  if (!items.length) throw purchaseValidation("Rascunho vazio não pode ser submetido.");

  const content = currentContent(existing, items);
  const hash = hashPurchaseContent(content);
  const nextVersion = existing.currentVersion + 1;
  const rule = await resolveApprovalRule(input.tenantId, toNum(existing.grandTotal));
  const nextStatus: PurchaseStatus = rule ? "submetido" : "aguardando_alcada_configurada";

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)))
      .for("update");
    if (!locked) throw purchaseNotFound();
    if (!submittable.includes(locked.status)) {
      throw purchaseConflict("O pedido mudou de estado. Recarregue antes de submeter novamente.");
    }

    await tx.insert(purchaseOrderVersions).values({
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      version: nextVersion,
      content: content as never,
      contentHash: hash,
      createdBy: input.userId,
    });

    await tx
      .update(purchaseOrders)
      .set({
        status: nextStatus,
        currentVersion: nextVersion,
        submittedAt: new Date(),
        approvedVersionHash: null,
        approvedRuleVersion: rule?.matrixVersion ?? null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.id));

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "submitted",
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: {
        version: nextVersion,
        contentHash: hash,
        grandTotal: toNum(locked.grandTotal),
        matrixVersion: rule?.matrixVersion ?? null,
        alcadaConfigured: !!rule,
      },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "update",
      entityId: input.id,
      before: { status: locked.status },
      after: { status: nextStatus, version: nextVersion, contentHash: hash },
    });
  });

  const detail = await getPurchaseOrder(input);
  if (!detail) throw purchaseNotFound();
  return detail;
}

// ---------------------------------------------------------------------------
// Aprovação / rejeição
// ---------------------------------------------------------------------------

export async function decidePurchaseOrder(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  decision: "approved" | "rejected";
  justification?: string | null;
  idempotencyKey?: string | null;
}) {
  requirePurchaseCapability(
    input.role,
    input.decision === "approved" ? "purchase.approve" : "purchase.reject"
  );

  if (input.decision === "rejected" && (input.justification ?? "").trim().length < 5) {
    throw purchaseValidation("Rejeição exige justificativa (mínimo 5 caracteres).");
  }

  if (input.idempotencyKey) {
    const event = await findEventByKey(input.tenantId, input.idempotencyKey);
    if (event) {
      const detail = await getPurchaseOrder(input);
      if (!detail) throw purchaseNotFound();
      return detail;
    }
  }

  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();
  if (existing.status !== "submetido") {
    throw purchaseConflict("Somente pedidos submetidos podem receber decisão.");
  }
  if (existing.createdBy === input.userId) {
    throw purchaseConflict(
      "Quem criou o pedido não pode aprová-lo nem rejeitá-lo. Peça a decisão a outro aprovador ativo.",
      { code: "SELF_APPROVAL" }
    );
  }

  const items = await loadOrderItems(input.tenantId, existing.id);
  const content = currentContent(existing, items);
  const hash = hashPurchaseContent(content);

  const [versionRow] = await db
    .select()
    .from(purchaseOrderVersions)
    .where(
      and(
        eq(purchaseOrderVersions.purchaseOrderId, existing.id),
        eq(purchaseOrderVersions.version, existing.currentVersion)
      )
    )
    .limit(1);

  if (!versionRow) throw purchaseConflict("Versão submetida não encontrada. Submeta novamente.");
  if (versionRow.contentHash !== hash) {
    throw purchaseConflict("O conteúdo do pedido mudou depois da submissão. Submeta novamente.");
  }

  const rule = await resolveApprovalRule(input.tenantId, toNum(existing.grandTotal));
  if (!rule) {
    throw purchaseConflict(
      "Não há faixa de alçada configurada para este valor. Configure a matriz antes de decidir.",
      { code: "ALCADA_NAO_CONFIGURADA" }
    );
  }
  if (!ruleAllowsApprover(rule, input.role)) {
    throw purchaseForbidden("Seu papel não está habilitado na alçada desta faixa de valor.", {
      code: "FORBIDDEN",
    });
  }

  const resultStatus: PurchaseStatus = input.decision === "approved" ? "aprovado" : "rejeitado";

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)))
      .for("update");
    if (!locked) throw purchaseNotFound();
    if (locked.status !== "submetido") {
      throw purchaseConflict("O pedido já recebeu uma decisão. Recarregue a tela.");
    }

    // Duplicidade explícita: mesma pessoa decidindo a mesma versão duas vezes.
    const [duplicate] = await tx
      .select({ id: purchaseApprovals.id })
      .from(purchaseApprovals)
      .where(
        and(
          eq(purchaseApprovals.purchaseOrderId, input.id),
          eq(purchaseApprovals.orderVersion, locked.currentVersion),
          eq(purchaseApprovals.actorUserId, input.userId)
        )
      )
      .limit(1);
    if (duplicate) {
      throw purchaseConflict("Você já registrou uma decisão para esta versão do pedido.");
    }

    await tx.insert(purchaseApprovals).values({
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      orderVersion: locked.currentVersion,
      contentHash: hash,
      ruleVersion: rule.matrixVersion,
      decision: input.decision,
      actorUserId: input.userId,
      justification: input.justification?.trim() || null,
    });

    const approvalsForVersion = await tx
      .select({ id: purchaseApprovals.id })
      .from(purchaseApprovals)
      .where(
        and(
          eq(purchaseApprovals.purchaseOrderId, input.id),
          eq(purchaseApprovals.orderVersion, locked.currentVersion),
          eq(purchaseApprovals.decision, "approved")
        )
      );

    const reached =
      input.decision === "approved" &&
      approvalsForVersion.length >= Math.max(1, rule.requiredApprovals);
    const finalStatus: PurchaseStatus =
      input.decision === "rejected" ? "rejeitado" : reached ? "aprovado" : "submetido";

    await tx
      .update(purchaseOrders)
      .set({
        status: finalStatus,
        approvedAt: reached ? new Date() : null,
        approvedVersionHash: reached ? hash : null,
        approvedRuleVersion: rule.matrixVersion,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.id));

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: input.decision,
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: {
        version: locked.currentVersion,
        contentHash: hash,
        matrixVersion: rule.matrixVersion,
        requiredApprovals: rule.requiredApprovals,
        approvalsCount: approvalsForVersion.length,
        justification: input.justification?.trim() || null,
        status: finalStatus,
      },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "update",
      entityId: input.id,
      before: { status: locked.status },
      after: { status: finalStatus, decision: input.decision, version: locked.currentVersion },
    });
  });

  const detail = await getPurchaseOrder(input);
  if (!detail) throw purchaseNotFound();
  return detail;
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

export async function issuePurchaseOrder(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  idempotencyKey: string;
}) {
  requirePurchaseCapability(input.role, "purchase.issue");

  const replay = await findEventByKey(input.tenantId, input.idempotencyKey);
  if (replay) {
    // Repetição da mesma requisição devolve o MESMO resultado, sem segundo número.
    if (replay.purchaseOrderId !== input.id) {
      throw purchaseConflict("Chave de idempotência já usada em outro pedido.");
    }
    const detail = await getPurchaseOrder(input);
    if (!detail) throw purchaseNotFound();
    return detail;
  }

  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();
  if (existing.status !== "aprovado") {
    throw purchaseConflict("Somente pedido aprovado pode ser emitido.");
  }

  const items = await loadOrderItems(input.tenantId, existing.id);
  const content = currentContent(existing, items);
  const hash = hashPurchaseContent(content);

  if (!existing.approvedVersionHash) {
    throw purchaseConflict("Pedido não possui aprovação válida registrada.");
  }
  if (existing.approvedVersionHash !== hash) {
    throw purchaseConflict(
      "A versão atual diverge da versão aprovada. Submeta e aprove novamente antes de emitir.",
      { code: "HASH_DIVERGES" }
    );
  }

  const rule = await assertMatrixHasNoGap(input.tenantId, toNum(existing.grandTotal));
  if (existing.approvedRuleVersion !== rule.matrixVersion) {
    throw purchaseConflict(
      "A matriz de alçadas mudou desde a aprovação. Submeta e aprove novamente antes de emitir."
    );
  }

  const approvals = await db
    .select({ actorUserId: purchaseApprovals.actorUserId })
    .from(purchaseApprovals)
    .where(
      and(
        eq(purchaseApprovals.purchaseOrderId, existing.id),
        eq(purchaseApprovals.orderVersion, existing.currentVersion),
        eq(purchaseApprovals.decision, "approved")
      )
    );

  if (approvals.length < Math.max(1, rule.requiredApprovals)) {
    throw purchaseConflict(
      `Aprovações insuficientes: ${approvals.length}/${rule.requiredApprovals}.`
    );
  }
  if (approvals.every((approval) => approval.actorUserId === existing.createdBy)) {
    throw purchaseConflict("A aprovação precisa vir de pessoa distinta do criador do pedido.");
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)))
      .for("update");
    if (!locked) throw purchaseNotFound();
    if (locked.status !== "aprovado") {
      throw purchaseConflict("O pedido já foi emitido ou cancelado. Recarregue a tela.");
    }

    const rows = await tx.execute<{ n: string }>(
      sql`select nextval('purchase_order_number_seq') as n`
    );
    const number = Number(rows[0].n);

    await tx
      .update(purchaseOrders)
      .set({
        number,
        status: "emitido",
        issuedAt: new Date(),
        approvedVersionHash: hash,
        approvedRuleVersion: rule.matrixVersion,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.id));

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "issued",
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      payload: { number, contentHash: hash, version: locked.currentVersion },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "update",
      entityId: input.id,
      before: { status: locked.status },
      after: { status: "emitido", number, contentHash: hash },
    });
  });

  const detail = await getPurchaseOrder(input);
  if (!detail) throw purchaseNotFound();
  return detail;
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

export async function addPurchaseFollowUp(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  type: "confirmacao" | "contato" | "ocorrencia" | "previsao";
  note: string;
  expectedDeliveryAt?: string | null;
  idempotencyKey?: string | null;
}) {
  requirePurchaseCapability(input.role, "purchase.follow_up");
  if (input.note.trim().length < 3) {
    throw purchaseValidation("Descreva o contato/ocorrência.");
  }

  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();

  const allowed: PurchaseStatus[] = ["emitido", "parcialmente_recebido", "recebido_completo"];
  if (!allowed.includes(existing.status)) {
    throw purchaseConflict(
      "Follow-up só é registrado em pedido emitido. Use a submissão/aprovação para as etapas anteriores."
    );
  }

  const expectedDeliveryAt = parseOptionalDate(input.expectedDeliveryAt, "expectedDeliveryAt");

  await db.transaction(async (tx) => {
    if (expectedDeliveryAt) {
      await tx
        .update(purchaseOrders)
        .set({ expectedDeliveryAt, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, input.id));
    }

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "follow_up",
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: {
        type: input.type,
        note: input.note.trim(),
        expectedDeliveryAt: expectedDeliveryAt?.toISOString() ?? null,
      },
    });
  });

  const detail = await getPurchaseOrder(input);
  if (!detail) throw purchaseNotFound();
  return detail;
}

// ---------------------------------------------------------------------------
// Cancelamento
// ---------------------------------------------------------------------------

export async function cancelPurchaseOrder(input: {
  tenantId: string;
  userId: string;
  role: string;
  id: string;
  reason: string;
  idempotencyKey?: string | null;
}) {
  requirePurchaseCapability(input.role, "purchase.cancel");
  if (input.reason.trim().length < 5) {
    throw purchaseValidation("Justificativa obrigatória para cancelamento (mínimo 5 caracteres).");
  }

  const existing = await loadOrderRow(input.tenantId, input.id);
  if (!existing) throw purchaseNotFound();

  const cancellable: PurchaseStatus[] = [
    "submetido",
    "aprovado",
    "emitido",
    "parcialmente_recebido",
    "aguardando_alcada_configurada",
  ];
  if (!cancellable.includes(existing.status)) {
    throw purchaseConflict(
      `Pedido ${PURCHASE_STATUS_LABEL[existing.status].toLowerCase()} não pode ser cancelado.`
    );
  }
  if (!canTransitionPurchase(existing.status, "cancelado")) {
    throw purchaseConflict("Transição inválida para cancelamento.");
  }

  const openReceipts = await db
    .select({ id: purchaseReceipts.id })
    .from(purchaseReceipts)
    .where(
      and(eq(purchaseReceipts.purchaseOrderId, input.id), isNull(purchaseReceipts.reversedAt))
    );

  if (openReceipts.length) {
    throw purchaseConflict(
      "Há recebimentos sem estorno. Estorne os recebimentos antes de cancelar o pedido."
    );
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.tenantId, input.tenantId)))
      .for("update");
    if (!locked) throw purchaseNotFound();
    if (!cancellable.includes(locked.status)) {
      throw purchaseConflict("O pedido mudou de estado e não pode mais ser cancelado.");
    }

    await tx
      .update(purchaseOrders)
      .set({
        status: "cancelado",
        cancelledAt: new Date(),
        cancellationReason: input.reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.id));

    await logEvent(tx, {
      tenantId: input.tenantId,
      purchaseOrderId: input.id,
      eventType: "cancelled",
      actorUserId: input.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: { reason: input.reason.trim(), previousStatus: locked.status },
    });
    await logAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "update",
      entityId: input.id,
      before: { status: locked.status },
      after: { status: "cancelado", reason: input.reason.trim() },
    });
  });

  const detail = await getPurchaseOrder(input);
  if (!detail) throw purchaseNotFound();
  return detail;
}

// ---------------------------------------------------------------------------
// Dados para o documento (PDF/CSV)
// ---------------------------------------------------------------------------

export async function getPurchaseDocumentData(tenantId: string, id: string) {
  const [row] = await db
    .select({
      order: purchaseOrders,
      supplier: suppliers,
      tenantName: tenants.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(tenants, eq(tenants.id, purchaseOrders.tenantId))
    .where(
      and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.tenantId, tenantId),
        isNull(purchaseOrders.deletedAt)
      )
    )
    .limit(1);

  if (!row) return null;

  const items = await loadOrderItems(tenantId, id);

  return {
    tenantName: row.tenantName,
    order: row.order,
    supplier: row.supplier,
    items: items.map(({ item, sku }) => ({
      ...item,
      sku: sku ?? "—",
      quantityOrdered: toNum(item.quantityOrdered),
      unitPrice: toNum(item.unitPrice),
      discountAmount: toNum(item.discountAmount),
      lineTotal: toNum(item.lineTotal),
      additionalCosts: item.additionalCosts ?? [],
    })),
  };
}

export type PurchaseDocumentData = NonNullable<Awaited<ReturnType<typeof getPurchaseDocumentData>>>;

// ---------------------------------------------------------------------------
// Consulta usada pelos testes/serviços satélite
// ---------------------------------------------------------------------------

export async function getOrderForReceipt(tenantId: string, id: string) {
  const order = await loadOrderRow(tenantId, id);
  if (!order) return null;
  const items = await loadOrderItems(tenantId, id);
  return { order, items };
}

export async function getActiveRulesForRole(tenantId: string, role: string, total: number) {
  const rules: ActiveApprovalRule[] = await listActiveApprovalRules(tenantId);
  const rule =
    rules.find(
      (candidate) =>
        total >= candidate.minTotal && (candidate.maxTotal === null || total < candidate.maxTotal)
    ) ?? null;
  return {
    rule,
    allowed: !!rule && ruleAllowsApprover(rule, role),
    matrixVersion: rules[0]?.matrixVersion ?? null,
  };
}

export const purchaseInternals = {
  canReceive,
  roundQuantity,
  toNum,
  getPurchaseCapabilities,
};

export type { PurchaseCapability };
