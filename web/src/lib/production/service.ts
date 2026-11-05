import { db } from "@/lib/db";
import {
  auditLog,
  customers,
  products,
  productionConsumptions,
  productionOperations,
  productionOrderItems,
  productionOrders,
  productionReports,
  productionResiduals,
  quoteItems,
  quotes,
  salesOrders,
  stockLots,
  stockMovements,
  stockRemnants,
  stockReservations,
  users,
  warehouses,
} from "@/lib/db/schema";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { CurrentUserSession } from "@/lib/auth/rbac";
import { requireProductionCapability } from "./capabilities";
import { ProductionError } from "./errors";
import {
  productionReportPayloadSchema,
  reportEnvelopeSchema,
  residualSchema,
  transitionSchema,
} from "./schemas";
import { formatRemnantCode } from "@/lib/stock/remnant-code";
import { recalculatePredictiveMetricsForTenant } from "@/lib/stock/predictive-engine";

type ProductionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const roundQty = (value: number) => Number(value.toFixed(4));

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function writeAudit(
  tx: ProductionTx,
  input: {
    tenantId: string;
    userId: string;
    entity: string;
    entityId: string;
    action: "insert" | "update" | "delete";
    before?: unknown;
    after?: unknown;
  }
) {
  await tx.insert(auditLog).values({
    tenantId: input.tenantId,
    userId: input.userId,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

export async function createProductionOrderForSalesOrder(
  tx: ProductionTx,
  input: { tenantId: string; salesOrderId: string; createdBy: string }
) {
  const [sale] = await tx
    .select({
      id: salesOrders.id,
      quoteId: salesOrders.quoteId,
      orderNumber: salesOrders.orderNumber,
      orderStatus: salesOrders.orderStatus,
      deliveryDeadline: salesOrders.deliveryDeadline,
      quoteStatus: quotes.status,
      quoteNumber: quotes.quoteNumber,
    })
    .from(salesOrders)
    .innerJoin(quotes, eq(quotes.id, salesOrders.quoteId))
    .where(
      and(
        eq(salesOrders.id, input.salesOrderId),
        eq(salesOrders.tenantId, input.tenantId),
        eq(quotes.tenantId, input.tenantId)
      )
    )
    .for("update");
  if (!sale || sale.quoteStatus !== "aprovado") {
    throw new ProductionError("Pedido confirmado não encontrado neste tenant.", 404);
  }

  const [existing] = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.tenantId, input.tenantId),
        eq(productionOrders.salesOrderId, sale.id)
      )
    )
    .limit(1);
  if (existing) return existing;
  if (sale.orderStatus !== "aguardando_producao") {
    throw new ProductionError("Somente pedido aguardando produção pode gerar ordem.", 409);
  }

  const items = await tx
    .select({ quoteItem: quoteItems, sku: products.sku, productName: products.commercialDescription })
    .from(quoteItems)
    .innerJoin(products, eq(products.id, quoteItems.productId))
    .where(eq(quoteItems.quoteId, sale.quoteId))
    .orderBy(asc(quoteItems.createdAt));
  if (!items.length) throw new ProductionError("Pedido aprovado não tem itens para produção.");

  const [created] = await tx
    .insert(productionOrders)
    .values({
      tenantId: input.tenantId,
      salesOrderId: sale.id,
      status: "planejada",
      dueAt: sale.deliveryDeadline,
      createdBy: input.createdBy,
    })
    .returning();

  for (const row of items) {
    const item = row.quoteItem;
    const [productionItem] = await tx
      .insert(productionOrderItems)
      .values({
        orderId: created.id,
        quoteItemId: item.id,
        productId: item.productId,
        plannedQty: String(item.quantity),
        specSnapshot: {
          quoteNumber: sale.quoteNumber,
          quoteItemId: item.id,
          sku: row.sku,
          productName: row.productName,
          geometryType: item.geometryType,
          thicknessMm: item.thicknessMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          diameterMm: item.diameterMm,
          innerDiameterMm: item.innerDiameterMm,
          wallMm: item.wallMm,
          processType: item.processType,
          quantity: item.quantity,
          netWeightKg: item.netWeightKg,
          grossWeightKg: item.grossWeightKg,
          remnantId: item.remnantId,
          machineId: item.machineId,
          setupMinutes: item.setupMinutes,
          estimatedCutTimeMinutes: item.estimatedCutTimeMinutes,
        },
      })
      .returning();

    await tx.insert(productionOperations).values({
      orderItemId: productionItem.id,
      sequence: 1,
      machineId: item.machineId,
      status: "planejada",
    });
  }

  await writeAudit(tx, {
    tenantId: input.tenantId,
    userId: input.createdBy,
    entity: "production_orders",
    entityId: created.id,
    action: "insert",
    after: {
      number: created.number,
      salesOrderId: sale.id,
      salesOrderNumber: sale.orderNumber,
      itemCount: items.length,
      status: created.status,
    },
  });
  return created;
}

export async function getProductionOrders(tenantId: string, orderId?: string) {
  const orders = await db
    .select({
      id: productionOrders.id,
      number: productionOrders.number,
      salesOrderId: productionOrders.salesOrderId,
      salesOrderNumber: salesOrders.orderNumber,
      quoteId: quotes.id,
      quoteNumber: quotes.quoteNumber,
      customerName: customers.tradeName,
      status: productionOrders.status,
      priority: productionOrders.priority,
      plannedStart: productionOrders.plannedStart,
      dueAt: productionOrders.dueAt,
      version: productionOrders.version,
      createdAt: productionOrders.createdAt,
      updatedAt: productionOrders.updatedAt,
    })
    .from(productionOrders)
    .innerJoin(salesOrders, eq(salesOrders.id, productionOrders.salesOrderId))
    .innerJoin(quotes, eq(quotes.id, salesOrders.quoteId))
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .where(and(eq(productionOrders.tenantId, tenantId), orderId ? eq(productionOrders.id, orderId) : undefined))
    .orderBy(desc(productionOrders.priority), asc(productionOrders.dueAt), desc(productionOrders.createdAt))
    .limit(150);
  const orderIds = orders.map((order) => order.id);
  const [items, reports, operations] = orderIds.length ? await Promise.all([
    db
      .select({
        id: productionOrderItems.id,
        orderId: productionOrderItems.orderId,
        quoteItemId: productionOrderItems.quoteItemId,
        productId: productionOrderItems.productId,
        sku: products.sku,
        productName: products.commercialDescription,
        unit: products.unit,
        plannedQty: productionOrderItems.plannedQty,
        completedQty: productionOrderItems.completedQty,
        cancelledQty: productionOrderItems.cancelledQty,
        cancellationReason: productionOrderItems.cancellationReason,
        specSnapshot: productionOrderItems.specSnapshot,
      })
      .from(productionOrderItems)
      .innerJoin(products, eq(products.id, productionOrderItems.productId))
      .where(inArray(productionOrderItems.orderId, orderIds))
      .orderBy(asc(productionOrderItems.createdAt), asc(productionOrderItems.id)),
    db
      .select({
        orderId: productionReports.orderId,
        status: productionReports.reconciliationStatus,
        count: count(),
      })
      .from(productionReports)
      .where(inArray(productionReports.orderId, orderIds))
      .groupBy(productionReports.orderId, productionReports.reconciliationStatus),
    db
      .select({
        orderId: productionOrderItems.orderId,
        itemId: productionOperations.orderItemId,
        operationId: productionOperations.id,
        operationStatus: productionOperations.status,
        operatorId: productionOperations.operatorId,
        machineId: productionOperations.machineId,
      })
      .from(productionOperations)
      .innerJoin(productionOrderItems, eq(productionOrderItems.id, productionOperations.orderItemId))
      .where(inArray(productionOrderItems.orderId, orderIds)),
  ]) : [[], [], []];

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsByOrder.get(item.orderId) ?? [];
    group.push(item);
    itemsByOrder.set(item.orderId, group);
  }
  const reportCounts = new Map<string, Record<string, number>>();
  for (const row of reports) {
    const group = reportCounts.get(row.orderId) ?? {};
    group[row.status] = row.count;
    reportCounts.set(row.orderId, group);
  }
  const operationByItem = new Map(operations.map((operation) => [operation.itemId, operation]));
  const mapped = orders.map((order) => ({
    ...order,
    items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
      ...item,
      ...operationByItem.get(item.id),
    })),
    reports: reportCounts.get(order.id) ?? {},
  }));
  if (orderId) return mapped;
  const pendingSales = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      quoteId: quotes.id,
      quoteNumber: quotes.quoteNumber,
      customerName: customers.tradeName,
      deliveryDeadline: salesOrders.deliveryDeadline,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .innerJoin(quotes, eq(quotes.id, salesOrders.quoteId))
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(productionOrders, and(eq(productionOrders.salesOrderId, salesOrders.id), eq(productionOrders.tenantId, tenantId)))
    .where(and(eq(salesOrders.tenantId, tenantId), eq(quotes.status, "aprovado"), eq(salesOrders.orderStatus, "aguardando_producao"), sql`${productionOrders.id} is null`))
    .orderBy(asc(salesOrders.deliveryDeadline), desc(salesOrders.createdAt))
    .limit(150);
  const pendingIds = pendingSales.map((sale) => sale.id);
  const pendingItems = pendingIds.length
    ? await db
        .select({
          orderId: salesOrders.id,
          id: quoteItems.id,
          quoteItemId: quoteItems.id,
          productId: quoteItems.productId,
          sku: products.sku,
          productName: products.commercialDescription,
          unit: products.unit,
          plannedQty: quoteItems.quantity,
          completedQty: sql<string>`'0'`,
          cancelledQty: sql<string>`'0'`,
          cancellationReason: sql<string | null>`null`,
          specSnapshot: sql<Record<string, unknown>>`jsonb_build_object('geometryType', ${quoteItems.geometryType}, 'thicknessMm', ${quoteItems.thicknessMm}, 'widthMm', ${quoteItems.widthMm}, 'lengthMm', ${quoteItems.lengthMm}, 'diameterMm', ${quoteItems.diameterMm}, 'processType', ${quoteItems.processType}, 'remnantId', ${quoteItems.remnantId}, 'machineId', ${quoteItems.machineId})`,
        })
        .from(quoteItems)
        .innerJoin(salesOrders, eq(salesOrders.quoteId, quoteItems.quoteId))
        .innerJoin(products, eq(products.id, quoteItems.productId))
        .where(inArray(salesOrders.id, pendingIds))
        .orderBy(asc(quoteItems.createdAt))
    : [];
  const pendingByOrder = new Map<string, typeof pendingItems>();
  for (const item of pendingItems) {
    const group = pendingByOrder.get(item.orderId) ?? [];
    group.push(item);
    pendingByOrder.set(item.orderId, group);
  }
  return [
    ...mapped,
    ...pendingSales.map((sale) => ({
      id: `pending:${sale.id}`,
      salesOrderId: sale.id,
      salesOrderNumber: sale.orderNumber,
      quoteId: sale.quoteId,
      quoteNumber: sale.quoteNumber,
      customerName: sale.customerName,
      status: "aguardando_op",
      priority: 0,
      plannedStart: null,
      dueAt: sale.deliveryDeadline,
      version: 0,
      createdAt: sale.createdAt,
      updatedAt: sale.createdAt,
      items: (pendingByOrder.get(sale.id) ?? []).map((item) => ({ ...item, operationId: "", operationStatus: "planejada", operatorId: null, machineId: null })),
      reports: {},
      pendingProduction: true,
    })),
  ];
}

export async function getProductionOrder(tenantId: string, orderId: string) {
  const orders = await getProductionOrders(tenantId, orderId);
  return orders.find((order) => order.id === orderId) ?? null;
}

async function releaseReservedResources(
  tx: ProductionTx,
  input: { tenantId: string; salesOrderId: string; quoteId: string; userId: string; reason: string }
) {
  const active = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.tenantId, input.tenantId),
        eq(stockReservations.sourceType, "pedido_venda"),
        eq(stockReservations.sourceId, input.salesOrderId),
        eq(stockReservations.status, "ativa")
      )
    )
    .for("update");
  for (const row of active) {
    const [released] = await tx
      .update(stockReservations)
      .set({ status: "liberada", releasedAt: new Date() })
      .where(eq(stockReservations.id, row.id))
      .returning();
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_reservations",
      entityId: row.id,
      action: "update",
      before: row,
      after: { ...released, releaseReason: input.reason },
    });
  }

  const remnants = await tx
    .select()
    .from(stockRemnants)
    .where(
      and(
        eq(stockRemnants.tenantId, input.tenantId),
        eq(stockRemnants.reservedForQuoteId, input.quoteId),
        eq(stockRemnants.status, "reservado")
      )
    )
    .for("update");
  for (const row of remnants) {
    const [released] = await tx
      .update(stockRemnants)
      .set({ status: "disponivel", reservedForQuoteId: null, updatedAt: new Date() })
      .where(eq(stockRemnants.id, row.id))
      .returning();
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_remnants",
      entityId: row.id,
      action: "update",
      before: row,
      after: { ...released, releaseReason: input.reason },
    });
  }
  return { reservations: active.length, remnants: remnants.length };
}

async function assertReservationsForRelease(
  tx: ProductionTx,
  order: typeof productionOrders.$inferSelect,
  quoteId: string
) {
  const items = await tx
    .select({
      productId: productionOrderItems.productId,
      remaining: sql<string>`${productionOrderItems.plannedQty} - ${productionOrderItems.completedQty} - ${productionOrderItems.cancelledQty}`,
      remnantId: quoteItems.remnantId,
    })
    .from(productionOrderItems)
    .innerJoin(quoteItems, eq(quoteItems.id, productionOrderItems.quoteItemId))
    .where(eq(productionOrderItems.orderId, order.id));

  const requiredByProduct = new Map<string, number>();
  for (const item of items) {
    if (item.remnantId) {
      const [remnant] = await tx
        .select({ id: stockRemnants.id, parentLotId: stockRemnants.parentLotId })
        .from(stockRemnants)
        .where(
          and(
            eq(stockRemnants.id, item.remnantId),
            eq(stockRemnants.tenantId, order.tenantId),
            eq(stockRemnants.status, "reservado"),
            eq(stockRemnants.reservedForQuoteId, quoteId)
          )
        )
        .for("update");
      if (remnant) {
        if (remnant.parentLotId) {
          const [parent] = await tx
            .select({ status: stockLots.status })
            .from(stockLots)
            .where(and(eq(stockLots.id, remnant.parentLotId), eq(stockLots.tenantId, order.tenantId)))
            .for("update");
          if (parent?.status === "bloqueado") {
            throw new ProductionError("Retalho está vinculado a lote bloqueado por qualidade.", 409);
          }
        }
        continue;
      }
    }
    requiredByProduct.set(
      item.productId,
      (requiredByProduct.get(item.productId) ?? 0) + toNumber(item.remaining)
    );
  }

  const reservations = await tx
    .select({
      productId: stockReservations.productId,
      lotId: stockReservations.lotId,
      remaining: sql<string>`${stockReservations.quantity} - ${stockReservations.consumedQuantity}`,
      lotStatus: stockLots.status,
    })
    .from(stockReservations)
    .innerJoin(stockLots, eq(stockLots.id, stockReservations.lotId))
    .where(
      and(
        eq(stockReservations.tenantId, order.tenantId),
        eq(stockReservations.sourceType, "pedido_venda"),
        eq(stockReservations.sourceId, order.salesOrderId),
        eq(stockReservations.status, "ativa")
      )
    )
    .for("update");
  const availableByProduct = new Map<string, number>();
  for (const reservation of reservations) {
    if (reservation.lotStatus === "bloqueado") continue;
    availableByProduct.set(
      reservation.productId,
      (availableByProduct.get(reservation.productId) ?? 0) + toNumber(reservation.remaining)
    );
  }
  for (const [productId, required] of requiredByProduct) {
    const reserved = availableByProduct.get(productId) ?? 0;
    if (reserved + 0.00005 < required) {
      throw new ProductionError(
        `Reserva LAC-03 insuficiente para liberar produto ${productId}. Necessário ${required}; reservado ${roundQty(reserved)}.`,
        409
      );
    }
  }
}

export async function transitionProductionOrder(input: {
  tenantId: string;
  orderId: string;
  user: CurrentUserSession;
  payload: unknown;
}) {
  const parsed = transitionSchema.safeParse(input.payload);
  if (!parsed.success) throw new ProductionError("Transição inválida.");
  const command = parsed.data;
  const capability =
    command.target === "liberada"
      ? "production.release"
      : command.target === "em_corte" || command.target === "pausada"
        ? "production.report"
        : "production.close";
  requireProductionCapability(input.user.role, capability);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.id, input.orderId),
          eq(productionOrders.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!order) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);
    if (order.version !== command.expectedVersion) {
      throw new ProductionError("A ordem mudou desde a última leitura; atualize antes de tentar novamente.", 409);
    }

    const now = new Date();
    const reason = command.reason?.trim() ?? "";
    const pendingReports = await tx
      .select({ id: productionReports.id })
      .from(productionReports)
      .where(
        and(
          eq(productionReports.tenantId, input.tenantId),
          eq(productionReports.orderId, order.id),
          inArray(productionReports.reconciliationStatus, [
            "pendente",
            "aguardando_aprovacao",
            "aprovado",
            "conflito",
          ])
        )
      );

    if (command.target === "liberada") {
      if (order.status !== "planejada" && order.status !== "bloqueada_qualidade") {
        throw new ProductionError("Somente ordem planejada ou bloqueada pode ser liberada.", 409);
      }
      if (order.status === "bloqueada_qualidade" && reason.length < 5) {
        throw new ProductionError("Justificativa da retomada deve ter ao menos 5 caracteres.");
      }
      if (pendingReports.length) {
        throw new ProductionError("Resolva apontamentos pendentes antes de liberar a ordem.", 409);
      }
      if (order.status === "planejada") {
        const [sale] = await tx
          .select({ quoteId: salesOrders.quoteId })
          .from(salesOrders)
          .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
        if (!sale) throw new ProductionError("Pedido de venda da ordem não encontrado.", 404);
        await assertReservationsForRelease(tx, order, sale.quoteId);
      }
    } else if (command.target === "em_corte") {
      if (order.status !== "liberada" && order.status !== "pausada") {
        throw new ProductionError("Somente ordem liberada ou pausada pode iniciar/retomar corte.", 409);
      }
      if (pendingReports.length) {
        throw new ProductionError("Resolva apontamentos pendentes antes de iniciar a operação.", 409);
      }
    } else if (command.target === "pausada") {
      if (order.status !== "em_corte") throw new ProductionError("Somente ordem em corte pode ser pausada.", 409);
      if (reason.length < 5) throw new ProductionError("Motivo da pausa deve ter ao menos 5 caracteres.");
    } else if (command.target === "bloqueada_qualidade") {
      if (!["liberada", "em_corte", "pausada"].includes(order.status)) {
        throw new ProductionError("Estado atual não permite bloqueio de qualidade.", 409);
      }
      if (reason.length < 5) throw new ProductionError("Motivo do bloqueio deve ter ao menos 5 caracteres.");
      const orderItemRows = await tx
        .select({ id: productionOrderItems.id })
        .from(productionOrderItems)
        .where(eq(productionOrderItems.orderId, order.id));
      if (orderItemRows.length) {
        await tx
          .update(productionOperations)
          .set({ status: "bloqueada_qualidade" })
          .where(inArray(productionOperations.orderItemId, orderItemRows.map((row) => row.id)));
      }
    } else if (command.target === "concluida") {
      if (order.status !== "em_corte" && order.status !== "pausada") {
        throw new ProductionError("Somente ordem em corte ou pausada pode ser concluída.", 409);
      }
      if (pendingReports.length) {
        throw new ProductionError("Resolva apontamentos pendentes antes de concluir a ordem.", 409);
      }
      const items = await tx
        .select()
        .from(productionOrderItems)
        .where(eq(productionOrderItems.orderId, order.id))
        .for("update");
      for (const item of items) {
        const remaining = roundQty(
          toNumber(item.plannedQty) - toNumber(item.completedQty) - toNumber(item.cancelledQty)
        );
        const cancellation = command.cancelledItems?.find((entry) => entry.itemId === item.id);
        if (remaining > 0 && (!cancellation || Math.abs(cancellation.quantity - remaining) > 0.00005)) {
          throw new ProductionError(
            `Item ${item.id} ainda tem ${remaining} pendente. Cancele exatamente o saldo com justificativa.`,
            409
          );
        }
        if (remaining <= 0 && cancellation) {
          throw new ProductionError("Não há saldo pendente para cancelar neste item.", 409);
        }
      }
      for (const cancellation of command.cancelledItems ?? []) {
        if (!items.some((item) => item.id === cancellation.itemId)) {
          throw new ProductionError("Item pendente não pertence à ordem.", 404);
        }
      }
      const inputTotals = await tx
        .select({ itemId: productionConsumptions.itemId, quantity: sql<string>`coalesce(sum(${productionConsumptions.quantity}), 0)` })
        .from(productionConsumptions)
        .where(eq(productionConsumptions.orderId, order.id))
        .groupBy(productionConsumptions.itemId);
      const consumedByItem = new Map(inputTotals.map((row) => [row.itemId, toNumber(row.quantity)]));
      for (const item of items) {
        const consumed = consumedByItem.get(item.id) ?? 0;
        const produced = toNumber(item.completedQty);
        if (produced > consumed + 0.00005) {
          throw new ProductionError("Quantidade produzida excede material consumido.", 409);
        }
        if (consumed > produced + 0.00005 && reason.length < 5) {
          throw new ProductionError("Fechamento com perda exige justificativa de ao menos 5 caracteres.");
        }
        const cancellation = command.cancelledItems?.find((entry) => entry.itemId === item.id);
        if (cancellation) {
          await tx
            .update(productionOrderItems)
            .set({ cancelledQty: String(cancellation.quantity), cancellationReason: cancellation.reason })
            .where(eq(productionOrderItems.id, item.id));
        }
      }
    } else if (command.target === "cancelada") {
      if (["concluida", "cancelada"].includes(order.status)) {
        throw new ProductionError("Ordem encerrada não pode ser cancelada novamente.", 409);
      }
      if (reason.length < 5) throw new ProductionError("Motivo do cancelamento deve ter ao menos 5 caracteres.");
      if (pendingReports.length) {
        throw new ProductionError("Resolva apontamentos pendentes antes de cancelar a ordem.", 409);
      }
    }

    if (command.target === "cancelada") {
      const totals = await tx
        .select({ quantity: sql<string>`coalesce(sum(${productionConsumptions.quantity}), 0)` })
        .from(productionConsumptions)
        .where(eq(productionConsumptions.orderId, order.id));
      if (toNumber(totals[0]?.quantity) > 0 && reason.length < 10) {
        throw new ProductionError("Cancelamento após consumo exige justificativa de ao menos 10 caracteres.");
      }
    }

    if (command.target === "cancelada") {
      const [sale] = await tx
        .select({ quoteId: salesOrders.quoteId })
        .from(salesOrders)
        .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
      if (sale) {
        await releaseReservedResources(tx, {
          tenantId: input.tenantId,
          salesOrderId: order.salesOrderId,
          quoteId: sale.quoteId,
          userId: input.user.id,
          reason: "ordem_producao_cancelada",
        });
      }
      await tx
        .update(salesOrders)
        .set({ orderStatus: "cancelado" })
        .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
    } else if (command.target === "em_corte") {
      await tx
        .update(salesOrders)
        .set({ orderStatus: "em_corte" })
        .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
    } else if (command.target === "concluida") {
      await tx
        .update(salesOrders)
        .set({ orderStatus: "pronto_faturamento" })
        .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
      const [sale] = await tx
        .select({ quoteId: salesOrders.quoteId })
        .from(salesOrders)
        .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, input.tenantId)));
      if (sale) {
        await releaseReservedResources(tx, {
          tenantId: input.tenantId,
          salesOrderId: order.salesOrderId,
          quoteId: sale.quoteId,
          userId: input.user.id,
          reason: "ordem_producao_concluida",
        });
      }
    }

    const newVersion = order.version + 1;
    const [updated] = await tx
      .update(productionOrders)
      .set({ status: command.target, version: newVersion, updatedAt: now })
      .where(eq(productionOrders.id, order.id))
      .returning();
    if (
      command.target === "em_corte" ||
      command.target === "pausada" ||
      command.target === "concluida" ||
      command.target === "cancelada"
    ) {
      const operations = await tx
        .select({ id: productionOperations.id, startedAt: productionOperations.startedAt, status: productionOperations.status, operatorId: productionOperations.operatorId })
        .from(productionOperations)
        .innerJoin(productionOrderItems, eq(productionOrderItems.id, productionOperations.orderItemId))
        .where(eq(productionOrderItems.orderId, order.id));
      for (const operation of operations) {
        if (command.target === "em_corte") {
          if (operation.status === "planejada") {
            await tx.update(productionOperations).set({ status: "em_execucao", startedAt: now, operatorId: input.user.id }).where(eq(productionOperations.id, operation.id));
          } else if (operation.status === "pausada" && operation.operatorId === input.user.id) {
            await tx.update(productionOperations).set({ status: "em_execucao", operatorId: input.user.id }).where(eq(productionOperations.id, operation.id));
          }
        } else if (command.target === "pausada") {
          await tx
            .update(productionOperations)
            .set({ status: "pausada" })
            .where(eq(productionOperations.id, operation.id));
        } else if (command.target === "concluida") {
          await tx
            .update(productionOperations)
            .set({ status: "concluida", endedAt: now })
            .where(eq(productionOperations.id, operation.id));
        } else {
          await tx
            .update(productionOperations)
            .set({ status: "cancelada", endedAt: now })
            .where(eq(productionOperations.id, operation.id));
        }
      }
    }
    if (command.target === "concluida" && command.cancelledItems?.length) {
      for (const cancellation of command.cancelledItems) {
        const [item] = await tx
          .select()
          .from(productionOrderItems)
          .where(eq(productionOrderItems.id, cancellation.itemId))
          .limit(1);
        if (item) {
          await writeAudit(tx, {
            tenantId: input.tenantId,
            userId: input.user.id,
            entity: "production_order_items",
            entityId: item.id,
            action: "update",
            before: { cancelledQty: item.cancelledQty, cancellationReason: item.cancellationReason },
            after: { cancelledQty: cancellation.quantity, cancellationReason: cancellation.reason },
          });
        }
      }
    }
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.user.id,
      entity: "production_orders",
      entityId: order.id,
      action: "update",
      before: order,
      after: {
        ...updated,
        transitionReason: reason || null,
        cancelledItems: command.cancelledItems ?? [],
      },
    });
    return updated;
  });
}

type ProductionPayload = ReturnType<typeof productionReportPayloadSchema.parse>;
type ReportEnvelope = ReturnType<typeof reportEnvelopeSchema.parse>;

function sameReportEnvelope(
  report: typeof productionReports.$inferSelect,
  envelope: ReportEnvelope
) {
  return (
    report.deviceId === envelope.deviceId &&
    report.sequence === envelope.sequence &&
    report.payloadVersion === envelope.payloadVersion &&
    report.expectedOrderVersion === envelope.expectedOrderVersion &&
    report.operationId === envelope.operationId &&
    report.reporterId === envelope.operatorId &&
    report.localOccurredAt.getTime() === new Date(envelope.localOccurredAt).getTime() &&
    stableStringify(report.payload) === stableStringify(envelope.payload)
  );
}

async function recordReportConflict(
  tx: ProductionTx,
  report: typeof productionReports.$inferSelect,
  userId: string,
  reason: string,
  qualityBlock = false
) {
  const [updated] = await tx
    .update(productionReports)
    .set({
      reconciliationStatus: "conflito",
      reconciliationReason: reason,
      processedAt: new Date(),
    })
    .where(eq(productionReports.id, report.id))
    .returning();
  if (qualityBlock) {
    const [order] = await tx
      .select()
      .from(productionOrders)
      .where(and(eq(productionOrders.id, report.orderId), eq(productionOrders.tenantId, report.tenantId)))
      .for("update");
    if (order && order.status !== "concluida" && order.status !== "cancelada") {
      const [blocked] = await tx
        .update(productionOrders)
        .set({ status: "bloqueada_qualidade", version: order.version + 1, updatedAt: new Date() })
        .where(eq(productionOrders.id, order.id))
        .returning();
      await writeAudit(tx, {
        tenantId: report.tenantId,
        userId,
        entity: "production_orders",
        entityId: order.id,
        action: "update",
        before: order,
        after: { ...blocked, blockReason: reason, source: "lote_bloqueado" },
      });
    }
  }
  await writeAudit(tx, {
    tenantId: report.tenantId,
    userId,
    entity: "production_reports",
    entityId: report.id,
    action: "update",
    before: report,
    after: updated,
  });
  return updated;
}

type PreparedConsumption =
  | {
      sourceType: "lot";
      sourceId: string;
      quantity: number;
      lot: typeof stockLots.$inferSelect;
      warehouse: typeof warehouses.$inferSelect;
      reservations: { reservation: typeof stockReservations.$inferSelect; quantity: number }[];
      parentLotId: string;
      unitCost: number;
      productUnit: string;
    }
  | {
      sourceType: "remnant";
      sourceId: string;
      quantity: number;
      remnant: typeof stockRemnants.$inferSelect;
      parentLot: typeof stockLots.$inferSelect;
      warehouse: typeof warehouses.$inferSelect;
      parentLotId: string;
      unitCost: number;
      productUnit: string;
    };

async function prepareConsumptions(
  tx: ProductionTx,
  input: {
    tenantId: string;
    order: typeof productionOrders.$inferSelect;
    item: typeof productionOrderItems.$inferSelect;
    quoteId: string;
    lines: ProductionPayload["consumptions"];
  }
): Promise<{ lines?: PreparedConsumption[]; conflict?: string; qualityBlocked?: boolean }> {
  const prepared: PreparedConsumption[] = [];
  for (const line of input.lines) {
    if (line.sourceType === "lot") {
      const [lot] = await tx
        .select()
        .from(stockLots)
        .where(
          and(
            eq(stockLots.id, line.sourceId),
            eq(stockLots.tenantId, input.tenantId),
            eq(stockLots.productId, input.item.productId)
          )
        )
        .for("update");
      if (!lot) return { conflict: "Lote não encontrado para o produto apontado." };
      if (lot.status === "bloqueado") {
        return { conflict: `Lote ${lot.lotNumber} bloqueado por qualidade.`, qualityBlocked: true };
      }
      if (lot.status !== "ativo") return { conflict: `Lote ${lot.lotNumber} não está ativo.` };

      const [warehouse] = await tx
        .select()
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, lot.warehouseId),
            eq(warehouses.tenantId, input.tenantId),
            eq(warehouses.active, true)
          )
        );
      if (!warehouse) return { conflict: `Depósito do lote ${lot.lotNumber} está inativo.` };

      const reservations = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.tenantId, input.tenantId),
            eq(stockReservations.lotId, lot.id),
            eq(stockReservations.status, "ativa")
          )
        )
        .orderBy(asc(stockReservations.createdAt))
        .for("update");
      const owned = reservations.filter(
        (reservation) =>
          reservation.sourceType === "pedido_venda" && reservation.sourceId === input.order.salesOrderId
      );
      const ownedRemaining = owned.reduce(
        (sum, reservation) => sum + toNumber(reservation.quantity) - toNumber(reservation.consumedQuantity),
        0
      );
      const totalReserved = reservations.reduce(
        (sum, reservation) => sum + toNumber(reservation.quantity) - toNumber(reservation.consumedQuantity),
        0
      );
      if (ownedRemaining + 0.00005 < line.quantity) {
        return { conflict: `Reserva deste pedido insuficiente no lote ${lot.lotNumber}.` };
      }
      if (toNumber(lot.quantityCurrent) + 0.00005 < line.quantity) {
        return { conflict: `Saldo físico insuficiente no lote ${lot.lotNumber}.` };
      }
      if (toNumber(lot.quantityCurrent) - line.quantity + 0.00005 < totalReserved - line.quantity) {
        return { conflict: `Consumo comprometeria reserva de outro pedido no lote ${lot.lotNumber}.` };
      }

      let remaining = line.quantity;
      const allocations: { reservation: typeof stockReservations.$inferSelect; quantity: number }[] = [];
      for (const reservation of owned) {
        const available = Math.max(0, toNumber(reservation.quantity) - toNumber(reservation.consumedQuantity));
        if (!available) continue;
        const portion = Math.min(remaining, available);
        allocations.push({ reservation, quantity: roundQty(portion) });
        remaining = roundQty(remaining - portion);
        if (remaining <= 0.00005) break;
      }
      prepared.push({
        sourceType: "lot",
        sourceId: lot.id,
        quantity: line.quantity,
        lot,
        warehouse,
        reservations: allocations,
        parentLotId: lot.id,
        unitCost: toNumber(lot.unitCost),
        productUnit: "",
      });
    } else {
      const [remnant] = await tx
        .select()
        .from(stockRemnants)
        .where(
          and(
            eq(stockRemnants.id, line.sourceId),
            eq(stockRemnants.tenantId, input.tenantId),
            eq(stockRemnants.productId, input.item.productId)
          )
        )
        .for("update");
      if (!remnant) return { conflict: "Retalho não encontrado para o produto apontado." };
      if (remnant.status !== "reservado" || remnant.reservedForQuoteId !== input.quoteId) {
        return { conflict: "Retalho precisa estar reservado para o orçamento deste pedido." };
      }
      const [quoteItem] = await tx
        .select({ remnantId: quoteItems.remnantId })
        .from(quoteItems)
        .where(and(eq(quoteItems.id, input.item.quoteItemId), eq(quoteItems.quoteId, input.quoteId)));
      if (!quoteItem || quoteItem.remnantId !== remnant.id) {
        return { conflict: "Retalho não pertence ao item aprovado deste pedido." };
      }
      if (!remnant.parentLotId) return { conflict: "Retalho sem lote de origem não pode ser consumido na produção." };
      const [parentLot] = await tx
        .select()
        .from(stockLots)
        .where(
          and(
            eq(stockLots.id, remnant.parentLotId),
            eq(stockLots.tenantId, input.tenantId),
            eq(stockLots.productId, input.item.productId)
          )
        )
        .for("update");
      if (!parentLot) return { conflict: "Lote de origem do retalho não encontrado." };
      if (parentLot.status === "bloqueado") {
        return { conflict: "Retalho vinculado a lote bloqueado por qualidade.", qualityBlocked: true };
      }
      const [warehouse] = await tx
        .select()
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, remnant.warehouseId),
            eq(warehouses.tenantId, input.tenantId),
            eq(warehouses.active, true)
          )
        );
      if (!warehouse) return { conflict: "Depósito do retalho está inativo." };
      const [product] = await tx
        .select({ unit: products.unit })
        .from(products)
        .where(and(eq(products.id, input.item.productId), eq(products.tenantId, input.tenantId)));
      if (!product || !["kg", "t"].includes(product.unit)) {
        return { conflict: "Consumo de retalho só é suportado para produtos em kg ou t; conversão não definida." };
      }
      const remnantQuantity =
        toNumber(remnant.weightKg) / (product.unit === "t" ? 1000 : 1);
      if (Math.abs(remnantQuantity - line.quantity) > 0.0005) {
        return {
          conflict: `Retalho é indivisível; quantidade deve corresponder ao peso medido (${roundQty(remnantQuantity)} ${product.unit}).`,
        };
      }
      prepared.push({
        sourceType: "remnant",
        sourceId: remnant.id,
        quantity: line.quantity,
        remnant,
        parentLot,
        warehouse,
        parentLotId: parentLot.id,
        unitCost: toNumber(parentLot.unitCost),
        productUnit: product.unit,
      });
    }
  }
  return { lines: prepared };
}

async function createResidualInTransaction(
  tx: ProductionTx,
  input: {
    tenantId: string;
    orderId: string;
    itemId: string;
    reportId: string;
    consumption: typeof productionConsumptions.$inferSelect;
    clientOperationId: string;
    thicknessMm: number;
    widthMm?: number;
    lengthMm?: number;
    diameterMm?: number;
    measuredWeightKg: number;
    locationAddress: string;
    notes?: string;
    userId: string;
  }
) {
  const [existing] = await tx
    .select()
    .from(productionResiduals)
    .where(
      and(
        eq(productionResiduals.tenantId, input.tenantId),
        eq(productionResiduals.clientOperationId, input.clientOperationId)
      )
    );
  if (existing) {
    const matches =
      existing.orderId === input.orderId &&
      existing.reportId === input.reportId &&
      existing.itemId === input.itemId &&
      existing.consumptionId === input.consumption.id &&
      Number(existing.thicknessMm) === input.thicknessMm &&
      Number(existing.widthMm ?? 0) === (input.widthMm ?? 0) &&
      Number(existing.lengthMm ?? 0) === (input.lengthMm ?? 0) &&
      Number(existing.diameterMm ?? 0) === (input.diameterMm ?? 0) &&
      Number(existing.measuredWeightKg) === input.measuredWeightKg;
    if (!matches) throw new ProductionError("UUID de retalho já foi usado por medição diferente.", 409);
    return existing;
  }

  const [item] = await tx
    .select({ productId: productionOrderItems.productId, unit: products.unit })
    .from(productionOrderItems)
    .innerJoin(products, eq(products.id, productionOrderItems.productId))
    .where(and(eq(productionOrderItems.id, input.itemId), eq(productionOrderItems.orderId, input.orderId)));
  if (!item) throw new ProductionError("Item de produção não encontrado.", 404);
  if (item.unit !== "kg" && item.unit !== "t") {
    throw new ProductionError("Retalho residual só pode ser registrado para produto em kg ou t; conversão não definida.", 409);
  }
  const consumedWeightKg = toNumber(input.consumption.quantity) * (item.unit === "t" ? 1000 : 1);
  if (input.measuredWeightKg > consumedWeightKg + 0.001) {
    throw new ProductionError("Peso medido do retalho excede material consumido na origem.", 409);
  }

  let parentLotId = input.consumption.lotId;
  let warehouseId: string | null = null;
  if (input.consumption.remnantId) {
    const [sourceRemnant] = await tx
      .select({ parentLotId: stockRemnants.parentLotId, warehouseId: stockRemnants.warehouseId })
      .from(stockRemnants)
      .where(and(eq(stockRemnants.id, input.consumption.remnantId), eq(stockRemnants.tenantId, input.tenantId)));
    parentLotId = sourceRemnant?.parentLotId ?? null;
    warehouseId = sourceRemnant?.warehouseId ?? null;
  } else if (parentLotId) {
    const [sourceLot] = await tx
      .select({ warehouseId: stockLots.warehouseId })
      .from(stockLots)
      .where(and(eq(stockLots.id, parentLotId), eq(stockLots.tenantId, input.tenantId)));
    warehouseId = sourceLot?.warehouseId ?? null;
  }
  if (!parentLotId || !warehouseId) {
    throw new ProductionError("Retalho residual precisa de lote de origem rastreável.", 409);
  }
  const [parentLot] = await tx
    .select({ status: stockLots.status })
    .from(stockLots)
    .where(and(eq(stockLots.id, parentLotId), eq(stockLots.tenantId, input.tenantId)))
    .for("update");
  if (!parentLot) throw new ProductionError("Lote de origem não encontrado.", 404);
  if (parentLot.status === "bloqueado") {
    throw new ProductionError("Lote de origem bloqueado por qualidade; retalho não criado.", 409);
  }

  const seqResult = await tx.execute<{ n: string }>(sql`select nextval('remnant_code_seq') as n`);
  const code = formatRemnantCode(Number(seqResult[0].n));
  const [remnant] = await tx
    .insert(stockRemnants)
    .values({
      tenantId: input.tenantId,
      code,
      parentLotId,
      productId: item.productId,
      warehouseId,
      thicknessMm: String(input.thicknessMm),
      widthMm: input.widthMm === undefined ? null : String(input.widthMm),
      lengthMm: input.lengthMm === undefined ? null : String(input.lengthMm),
      diameterMm: input.diameterMm === undefined ? null : String(input.diameterMm),
      weightKg: String(input.measuredWeightKg),
      locationAddress: input.locationAddress,
      status: "disponivel",
      notes: input.notes ?? null,
    })
    .returning();
  const [residual] = await tx
    .insert(productionResiduals)
    .values({
      tenantId: input.tenantId,
      orderId: input.orderId,
      itemId: input.itemId,
      reportId: input.reportId,
      consumptionId: input.consumption.id,
      stockRemnantId: remnant.id,
      parentLotId,
      thicknessMm: String(input.thicknessMm),
      widthMm: input.widthMm === undefined ? null : String(input.widthMm),
      lengthMm: input.lengthMm === undefined ? null : String(input.lengthMm),
      diameterMm: input.diameterMm === undefined ? null : String(input.diameterMm),
      measuredWeightKg: String(input.measuredWeightKg),
      measuredBy: input.userId,
      clientOperationId: input.clientOperationId,
    })
    .returning();
  await writeAudit(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    entity: "production_residuals",
    entityId: residual.id,
    action: "insert",
    after: { ...residual, remnantCode: remnant.code, remnantId: remnant.id },
  });
  return residual;
}

async function applyProductionReport(
  tx: ProductionTx,
  input: {
    report: typeof productionReports.$inferSelect;
    order: typeof productionOrders.$inferSelect;
    user: CurrentUserSession;
    payload: ProductionPayload;
    lossApproved: boolean;
  }
): Promise<{ report: typeof productionReports.$inferSelect; changedStock: boolean }> {
  const { report, order, user, payload } = input;
  if (report.expectedOrderVersion !== order.version) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        "Versão da ordem mudou antes da sincronização; reconciliação manual necessária."
      ),
      changedStock: false,
    };
  }
  if (order.status !== "em_corte") {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        `Ordem está ${order.status}; apontamento só pode ser aplicado durante corte.`
      ),
      changedStock: false,
    };
  }
  const [operation] = await tx
    .select()
    .from(productionOperations)
    .innerJoin(productionOrderItems, eq(productionOrderItems.id, productionOperations.orderItemId))
    .where(
      and(
        eq(productionOperations.id, report.operationId!),
        eq(productionOperations.orderItemId, payload.orderItemId),
        eq(productionOrderItems.orderId, order.id)
      )
    )
    .for("update");
  if (
    !operation ||
    operation.production_operations.status !== "em_execucao" ||
    operation.production_operations.operatorId !== report.reporterId
  ) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        "Operação não está em execução pelo usuário deste apontamento."
      ),
      changedStock: false,
    };
  }
  const [item] = await tx
    .select()
    .from(productionOrderItems)
    .where(and(eq(productionOrderItems.id, payload.orderItemId), eq(productionOrderItems.orderId, order.id)))
    .for("update");
  if (!item) {
    return {
      report: await recordReportConflict(tx, report, user.id, "Item não pertence à ordem de produção."),
      changedStock: false,
    };
  }
  if (payload.completedQty <= 0 || !payload.consumptions.length) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        "Apontamento precisa informar produção concluída e consumo de material."
      ),
      changedStock: false,
    };
  }
  const completedAfter = roundQty(toNumber(item.completedQty) + payload.completedQty);
  const producibleQty = toNumber(item.plannedQty) - toNumber(item.cancelledQty);
  if (completedAfter > producibleQty + 0.00005) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        `Quantidade apontada excede o saldo planejado (${roundQty(producibleQty - toNumber(item.completedQty))}).`
      ),
      changedStock: false,
    };
  }

  const [sale] = await tx
    .select({ quoteId: salesOrders.quoteId })
    .from(salesOrders)
    .where(and(eq(salesOrders.id, order.salesOrderId), eq(salesOrders.tenantId, order.tenantId)));
  if (!sale) {
    return {
      report: await recordReportConflict(tx, report, user.id, "Pedido de venda não encontrado."),
      changedStock: false,
    };
  }
  const preparedResult = await prepareConsumptions(tx, {
    tenantId: order.tenantId,
    order,
    item,
    quoteId: sale.quoteId,
    lines: payload.consumptions,
  });
  if (!preparedResult.lines) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        preparedResult.conflict ?? "Material não pôde ser validado.",
        preparedResult.qualityBlocked
      ),
      changedStock: false,
    };
  }
  const residualIndexes = payload.residuals.map((residual) => residual.consumptionIndex);
  if (residualIndexes.some((index) => index >= preparedResult.lines!.length)) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        "Retalho residual aponta para consumo que não existe."
      ),
      changedStock: false,
    };
  }
  const [prior] = await tx
    .select({ quantity: sql<string>`coalesce(sum(${productionConsumptions.quantity}), 0)` })
    .from(productionConsumptions)
    .where(eq(productionConsumptions.itemId, item.id));
  const newInputQty = roundQty(preparedResult.lines.reduce((sum, line) => sum + line.quantity, 0));
  const totalConsumedAfter = roundQty(toNumber(prior?.quantity) + newInputQty);
  if (totalConsumedAfter + 0.00005 < completedAfter) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        `Material consumido (${totalConsumedAfter}) é menor que produção apontada (${completedAfter}).`
      ),
      changedStock: false,
    };
  }
  const loss = roundQty(totalConsumedAfter - completedAfter);
  if (loss > 0.00005 && !payload.lossReason) {
    return {
      report: await recordReportConflict(
        tx,
        report,
        user.id,
        `Diferença de rendimento ${loss} exige justificativa e aprovação de admin/diretor.`
      ),
      changedStock: false,
    };
  }
  if (loss > 0.00005 && !input.lossApproved) {
    const [waiting] = await tx
      .update(productionReports)
      .set({
        reconciliationStatus: "aguardando_aprovacao",
        reconciliationReason: `Perda de ${loss} requer aprovação de admin/diretor. ${payload.lossReason}`,
      })
      .where(eq(productionReports.id, report.id))
      .returning();
    await writeAudit(tx, {
      tenantId: order.tenantId,
      userId: user.id,
      entity: "production_reports",
      entityId: report.id,
      action: "update",
      before: report,
      after: waiting,
    });
    return { report: waiting, changedStock: false };
  }

  const consumptionByIndex: typeof productionConsumptions.$inferSelect[] = [];
  for (const [index, line] of preparedResult.lines.entries()) {
    if (line.sourceType === "lot") {
      const remainingLotQty = roundQty(toNumber(line.lot.quantityCurrent) - line.quantity);
      const [updatedLot] = await tx
        .update(stockLots)
        .set({ quantityCurrent: String(remainingLotQty), status: remainingLotQty === 0 ? "esgotado" : "ativo" })
        .where(eq(stockLots.id, line.lot.id))
        .returning();
      let firstConsumption: typeof productionConsumptions.$inferSelect | undefined;
      for (const allocation of line.reservations) {
        const consumed = roundQty(
          toNumber(allocation.reservation.consumedQuantity) + allocation.quantity
        );
        const fullyConsumed = consumed + 0.00005 >= toNumber(allocation.reservation.quantity);
        const [updatedReservation] = await tx
          .update(stockReservations)
          .set({
            consumedQuantity: String(Math.min(consumed, toNumber(allocation.reservation.quantity))),
            status: fullyConsumed ? "consumida" : "ativa",
          })
          .where(eq(stockReservations.id, allocation.reservation.id))
          .returning();
        const [movement] = await tx
          .insert(stockMovements)
          .values({
            tenantId: order.tenantId,
            productId: line.lot.productId,
            lotId: line.lot.id,
            warehouseId: line.lot.warehouseId,
            movementType: "CORTE_CONSUMO",
            quantity: String(-allocation.quantity),
            unitCost: String(line.unitCost),
            totalCost: String(Number((allocation.quantity * line.unitCost).toFixed(2))),
            referenceDocument: `OP ${order.number}`,
            notes: `Apontamento ${report.clientOperationId}; reserva ${allocation.reservation.id}`,
            createdBy: user.id,
          })
          .returning();
        const [consumption] = await tx
          .insert(productionConsumptions)
          .values({
            tenantId: order.tenantId,
            orderId: order.id,
            itemId: item.id,
            reportId: report.id,
            reservationId: allocation.reservation.id,
            lotId: line.lot.id,
            quantity: String(allocation.quantity),
            movementId: movement.id,
          })
          .returning();
        firstConsumption ??= consumption;
        await writeAudit(tx, {
          tenantId: order.tenantId,
          userId: user.id,
          entity: "stock_reservations",
          entityId: allocation.reservation.id,
          action: "update",
          before: allocation.reservation,
          after: updatedReservation,
        });
      }
      if (!firstConsumption) {
        throw new Error("Reserva válida não produziu alocação de consumo.");
      }
      consumptionByIndex[index] = firstConsumption;
      await writeAudit(tx, {
        tenantId: order.tenantId,
        userId: user.id,
        entity: "stock_lots",
        entityId: line.lot.id,
        action: "update",
        before: { quantityCurrent: line.lot.quantityCurrent, status: line.lot.status },
        after: { quantityCurrent: updatedLot.quantityCurrent, status: updatedLot.status, reportId: report.id },
      });
    } else {
      const [updatedRemnant] = await tx
        .update(stockRemnants)
        .set({ status: "consumido", reservedForQuoteId: null, updatedAt: new Date() })
        .where(eq(stockRemnants.id, line.remnant.id))
        .returning();
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: order.tenantId,
          productId: line.remnant.productId,
          lotId: null,
          warehouseId: line.remnant.warehouseId,
          movementType: "CORTE_CONSUMO",
          quantity: String(-line.quantity),
          unitCost: String(line.unitCost),
          totalCost: String(Number((line.quantity * line.unitCost).toFixed(2))),
          referenceDocument: `OP ${order.number}`,
          notes: `Consumo do retalho ${line.remnant.code}; lote de origem ${line.parentLotId}; apontamento ${report.clientOperationId}`,
          createdBy: user.id,
        })
        .returning();
      const [consumption] = await tx
        .insert(productionConsumptions)
        .values({
          tenantId: order.tenantId,
          orderId: order.id,
          itemId: item.id,
          reportId: report.id,
          remnantId: line.remnant.id,
          quantity: String(line.quantity),
          movementId: movement.id,
        })
        .returning();
      consumptionByIndex[index] = consumption;
      await writeAudit(tx, {
        tenantId: order.tenantId,
        userId: user.id,
        entity: "stock_remnants",
        entityId: line.remnant.id,
        action: "update",
        before: line.remnant,
        after: { ...updatedRemnant, consumedByReport: report.id, parentLotId: line.parentLotId },
      });
    }
  }

  for (const residual of payload.residuals) {
    const consumption = consumptionByIndex[residual.consumptionIndex];
    await createResidualInTransaction(tx, {
      tenantId: order.tenantId,
      orderId: order.id,
      itemId: item.id,
      reportId: report.id,
      consumption,
      clientOperationId: residual.clientOperationId,
      thicknessMm: residual.thicknessMm,
      widthMm: residual.widthMm,
      lengthMm: residual.lengthMm,
      diameterMm: residual.diameterMm,
      measuredWeightKg: residual.measuredWeightKg,
      locationAddress: residual.locationAddress,
      notes: residual.notes,
      userId: user.id,
    });
  }

  const [updatedItem] = await tx
    .update(productionOrderItems)
    .set({ completedQty: String(completedAfter) })
    .where(eq(productionOrderItems.id, item.id))
    .returning();
  const newVersion = order.version + 1;
  const [updatedOrder] = await tx
    .update(productionOrders)
    .set({ version: newVersion, updatedAt: new Date() })
    .where(eq(productionOrders.id, order.id))
    .returning();
  const [updatedReport] = await tx
    .update(productionReports)
    .set({
      reconciliationStatus: "aplicado",
      reconciliationReason: loss > 0.00005 ? report.reconciliationReason : null,
      processedAt: new Date(),
      resultingOrderVersion: newVersion,
    })
    .where(eq(productionReports.id, report.id))
    .returning();
  await writeAudit(tx, {
    tenantId: order.tenantId,
    userId: user.id,
    entity: "production_order_items",
    entityId: item.id,
    action: "update",
    before: item,
    after: { ...updatedItem, reportId: report.id, materialLoss: loss },
  });
  await writeAudit(tx, {
    tenantId: order.tenantId,
    userId: user.id,
    entity: "production_orders",
    entityId: order.id,
    action: "update",
    before: order,
    after: { ...updatedOrder, reportId: report.id },
  });
  await writeAudit(tx, {
    tenantId: order.tenantId,
    userId: user.id,
    entity: "production_reports",
    entityId: report.id,
    action: "update",
    before: report,
    after: updatedReport,
  });
  return { report: updatedReport, changedStock: true };
}

async function finishReportSubmission(
  tx: ProductionTx,
  input: {
    report: typeof productionReports.$inferSelect;
    order: typeof productionOrders.$inferSelect;
    user: CurrentUserSession;
    rawPayload: unknown;
    lossApproved: boolean;
  }
) {
  if (input.report.payloadVersion !== 1) {
    return {
      report: await recordReportConflict(
        tx,
        input.report,
        input.user.id,
        `Versão de payload ${input.report.payloadVersion} não suportada; operação preservada para reconciliação.`
      ),
      changedStock: false,
    };
  }
  const parsed = productionReportPayloadSchema.safeParse(input.rawPayload);
  if (!parsed.success) {
    return {
      report: await recordReportConflict(
        tx,
        input.report,
        input.user.id,
        "Payload inválido; operação preservada para reconciliação manual."
      ),
      changedStock: false,
    };
  }
  return applyProductionReport(tx, {
    report: input.report,
    order: input.order,
    user: input.user,
    payload: parsed.data,
    lossApproved: input.lossApproved,
  });
}

export async function submitProductionReport(input: {
  tenantId: string;
  orderId: string;
  user: CurrentUserSession;
  payload: unknown;
}) {
  requireProductionCapability(input.user.role, "production.report");
  const envelopeResult = reportEnvelopeSchema.safeParse(input.payload);
  if (!envelopeResult.success) throw new ProductionError("Envelope do apontamento inválido.");
  const envelope = envelopeResult.data;
  if (envelope.operatorId !== input.user.id) {
    throw new ProductionError("Apontamento offline só pode ser sincronizado pelo mesmo usuário que o registrou.", 403);
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productionReports)
      .where(
        and(
          eq(productionReports.tenantId, input.tenantId),
          eq(productionReports.clientOperationId, envelope.clientOperationId)
        )
      );
    if (existing) {
      if (!sameReportEnvelope(existing, envelope)) {
        throw new ProductionError("UUID de operação já usado por payload diferente.", 409);
      }
      return { report: existing, changedStock: false, replayed: true };
    }

    const [order] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.id, input.orderId),
          eq(productionOrders.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!order) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);

    const [created] = await tx
      .insert(productionReports)
      .values({
        tenantId: input.tenantId,
        orderId: order.id,
        operationId: envelope.operationId,
        clientOperationId: envelope.clientOperationId,
        deviceId: envelope.deviceId,
        sequence: envelope.sequence,
        payloadVersion: envelope.payloadVersion,
        expectedOrderVersion: envelope.expectedOrderVersion,
        reporterId: input.user.id,
        localOccurredAt: new Date(envelope.localOccurredAt),
        payload: envelope.payload,
        reconciliationStatus: "pendente",
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [sameClientId] = await tx
        .select()
        .from(productionReports)
        .where(
          and(
            eq(productionReports.tenantId, input.tenantId),
            eq(productionReports.clientOperationId, envelope.clientOperationId)
          )
        );
      if (sameClientId && sameReportEnvelope(sameClientId, envelope)) {
        return { report: sameClientId, changedStock: false, replayed: true };
      }
      const [sameSequence] = await tx
        .select({ id: productionReports.id })
        .from(productionReports)
        .where(
          and(
            eq(productionReports.tenantId, input.tenantId),
            eq(productionReports.deviceId, envelope.deviceId),
            eq(productionReports.sequence, envelope.sequence)
          )
        );
      if (sameSequence) {
        throw new ProductionError("Sequência do dispositivo já foi usada por outra operação.", 409);
      }
      throw new ProductionError("Não foi possível registrar apontamento idempotente.", 409);
    }

    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.user.id,
      entity: "production_reports",
      entityId: created.id,
      action: "insert",
      after: created,
    });
    const finished = await finishReportSubmission(tx, {
      report: created,
      order,
      user: input.user,
      rawPayload: envelope.payload,
      lossApproved: false,
    });
    return { ...finished, replayed: false };
  });

  if (result.changedStock) {
    try {
      await recalculatePredictiveMetricsForTenant(input.tenantId);
    } catch (error) {
      console.error("Erro ao atualizar métricas após consumo de produção:", error);
    }
  }
  return result;
}

export async function approveProductionReport(input: {
  tenantId: string;
  orderId: string;
  reportId: string;
  user: CurrentUserSession;
  reason: string;
}) {
  requireProductionCapability(input.user.role, "production.approve_loss");
  if (input.reason.trim().length < 5) {
    throw new ProductionError("Justificativa da aprovação deve ter ao menos 5 caracteres.");
  }
  const result = await db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(productionReports)
      .where(
        and(
          eq(productionReports.id, input.reportId),
          eq(productionReports.orderId, input.orderId),
          eq(productionReports.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!report) throw new ProductionError("Apontamento não encontrado neste tenant.", 404);
    if (report.reconciliationStatus === "aplicado") return { report, changedStock: false };
    if (report.reconciliationStatus !== "aguardando_aprovacao") {
      throw new ProductionError("Apontamento não está aguardando aprovação de perda.", 409);
    }
    if (report.reporterId === input.user.id) {
      throw new ProductionError("Aprovação de perda exige pessoa diferente de quem apontou.", 403);
    }
    const [approved] = await tx
      .update(productionReports)
      .set({
        reconciliationStatus: "aprovado",
        reconciliationReason: `${report.reconciliationReason ?? "Perda apontada."} Aprovação: ${input.reason.trim()}`,
        approvedBy: input.user.id,
        approvedAt: new Date(),
      })
      .where(eq(productionReports.id, report.id))
      .returning();
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.user.id,
      entity: "production_reports",
      entityId: report.id,
      action: "update",
      before: report,
      after: approved,
    });
    return { report: approved, changedStock: false };
  });
  return result;
}

export async function applyApprovedProductionReport(input: {
  tenantId: string;
  orderId: string;
  reportId: string;
  user: CurrentUserSession;
}) {
  requireProductionCapability(input.user.role, "production.report");
  const result = await db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(productionReports)
      .where(
        and(
          eq(productionReports.id, input.reportId),
          eq(productionReports.orderId, input.orderId),
          eq(productionReports.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!report) throw new ProductionError("Apontamento não encontrado neste tenant.", 404);
    if (report.reconciliationStatus === "aplicado") return { report, changedStock: false };
    if (report.reconciliationStatus !== "aprovado") {
      throw new ProductionError("Apontamento ainda não foi aprovado para baixa.", 409);
    }
    if (report.reporterId !== input.user.id) {
      throw new ProductionError("Somente operador que enviou apontamento pode confirmar a baixa.", 403);
    }
    const [order] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.id, report.orderId),
          eq(productionOrders.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!order) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);
    const parsed = productionReportPayloadSchema.safeParse(report.payload as unknown);
    if (!parsed.success) {
      return {
        report: await recordReportConflict(tx, report, input.user.id, "Payload inválido após aprovação."),
        changedStock: false,
      };
    }
    return applyProductionReport(tx, {
      report,
      order,
      user: input.user,
      payload: parsed.data,
      lossApproved: true,
    });
  });
  if (result.changedStock) {
    try {
      await recalculatePredictiveMetricsForTenant(input.tenantId);
    } catch (error) {
      console.error("Erro ao atualizar métricas após baixa de produção aprovada:", error);
    }
  }
  return result;
}

export async function resolveProductionReport(input: {
  tenantId: string;
  orderId: string;
  reportId: string;
  user: CurrentUserSession;
  reason: string;
}) {
  requireProductionCapability(input.user.role, "production.approve_loss");
  if (input.reason.trim().length < 5) {
    throw new ProductionError("Motivo da rejeição deve ter ao menos 5 caracteres.");
  }
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(productionReports)
      .where(
        and(
          eq(productionReports.id, input.reportId),
          eq(productionReports.orderId, input.orderId),
          eq(productionReports.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!report) throw new ProductionError("Apontamento não encontrado neste tenant.", 404);
    if (!["conflito", "aguardando_aprovacao"].includes(report.reconciliationStatus)) {
      throw new ProductionError("Somente apontamento pendente pode ser rejeitado.", 409);
    }
    const [updated] = await tx
      .update(productionReports)
      .set({
        reconciliationStatus: "rejeitado",
        reconciliationReason: input.reason.trim(),
        processedAt: new Date(),
      })
      .where(eq(productionReports.id, report.id))
      .returning();
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.user.id,
      entity: "production_reports",
      entityId: report.id,
      action: "update",
      before: report,
      after: updated,
    });
    return updated;
  });
}

export async function getProductionReports(tenantId: string, orderId: string) {
  const order = await db
    .select({ id: productionOrders.id })
    .from(productionOrders)
    .where(and(eq(productionOrders.id, orderId), eq(productionOrders.tenantId, tenantId)));
  if (!order.length) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);
  const rows = await db
    .select({
      id: productionReports.id,
      clientOperationId: productionReports.clientOperationId,
      deviceId: productionReports.deviceId,
      sequence: productionReports.sequence,
      payloadVersion: productionReports.payloadVersion,
      expectedOrderVersion: productionReports.expectedOrderVersion,
      operationId: productionReports.operationId,
      reporterId: productionReports.reporterId,
      reporterName: sql<string>`coalesce(${users.name}, 'Usuário removido')`,
      localOccurredAt: productionReports.localOccurredAt,
      payload: productionReports.payload,
      reconciliationStatus: productionReports.reconciliationStatus,
      reconciliationReason: productionReports.reconciliationReason,
      approvedBy: productionReports.approvedBy,
      approvedAt: productionReports.approvedAt,
      receivedAt: productionReports.receivedAt,
      processedAt: productionReports.processedAt,
      resultingOrderVersion: productionReports.resultingOrderVersion,
    })
    .from(productionReports)
    .leftJoin(users, eq(users.id, productionReports.reporterId))
    .where(and(eq(productionReports.tenantId, tenantId), eq(productionReports.orderId, orderId)))
    .orderBy(desc(productionReports.receivedAt));
  return rows;
}

export async function getProductionOrderDetails(tenantId: string, orderId: string) {
  const order = await getProductionOrder(tenantId, orderId);
  if (!order) return null;
  const [reports, consumptions, residuals, reservedLots, reservedRemnants] = await Promise.all([
    getProductionReports(tenantId, orderId),
    db
      .select({
        id: productionConsumptions.id,
        itemId: productionConsumptions.itemId,
        sku: products.sku,
        productName: products.commercialDescription,
        quantity: productionConsumptions.quantity,
        lotId: productionConsumptions.lotId,
        lotNumber: stockLots.lotNumber,
        remnantId: productionConsumptions.remnantId,
        remnantCode: stockRemnants.code,
        movementId: productionConsumptions.movementId,
        reportId: productionConsumptions.reportId,
        createdAt: productionConsumptions.createdAt,
      })
      .from(productionConsumptions)
      .innerJoin(productionOrderItems, eq(productionOrderItems.id, productionConsumptions.itemId))
      .innerJoin(products, eq(products.id, productionOrderItems.productId))
      .leftJoin(stockLots, eq(stockLots.id, productionConsumptions.lotId))
      .leftJoin(stockRemnants, eq(stockRemnants.id, productionConsumptions.remnantId))
      .where(
        and(
          eq(productionConsumptions.tenantId, tenantId),
          eq(productionConsumptions.orderId, orderId)
        )
      )
      .orderBy(desc(productionConsumptions.createdAt)),
    db
      .select({
        id: productionResiduals.id,
        itemId: productionResiduals.itemId,
        reportId: productionResiduals.reportId,
        stockRemnantId: productionResiduals.stockRemnantId,
        code: stockRemnants.code,
        parentLotId: productionResiduals.parentLotId,
        thicknessMm: productionResiduals.thicknessMm,
        widthMm: productionResiduals.widthMm,
        lengthMm: productionResiduals.lengthMm,
        diameterMm: productionResiduals.diameterMm,
        measuredWeightKg: productionResiduals.measuredWeightKg,
        measuredBy: productionResiduals.measuredBy,
        createdAt: productionResiduals.createdAt,
      })
      .from(productionResiduals)
      .innerJoin(stockRemnants, eq(stockRemnants.id, productionResiduals.stockRemnantId))
      .where(
        and(
          eq(productionResiduals.tenantId, tenantId),
          eq(productionResiduals.orderId, orderId)
        )
      )
      .orderBy(desc(productionResiduals.createdAt)),
    db
      .select({
        itemProductId: productionOrderItems.productId,
        id: stockLots.id,
        type: sql<string>`'lot'`,
        lotNumber: stockLots.lotNumber,
        remnantCode: sql<string | null>`null`,
        availableQty: sql<string>`${stockReservations.quantity} - ${stockReservations.consumedQuantity}`,
        unit: products.unit,
        warehouseName: warehouses.name,
      })
      .from(stockReservations)
      .innerJoin(stockLots, eq(stockLots.id, stockReservations.lotId))
      .innerJoin(productionOrders, eq(productionOrders.salesOrderId, stockReservations.sourceId))
      .innerJoin(productionOrderItems, eq(productionOrderItems.orderId, productionOrders.id))
      .innerJoin(products, eq(products.id, productionOrderItems.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockLots.warehouseId))
      .where(
        and(
          eq(productionOrders.id, orderId),
          eq(productionOrders.tenantId, tenantId),
          eq(stockReservations.tenantId, tenantId),
          eq(stockReservations.sourceType, "pedido_venda"),
          eq(stockReservations.status, "ativa"),
          eq(stockLots.status, "ativo"),
          eq(warehouses.active, true),
          eq(productionOrderItems.productId, stockReservations.productId)
        )
      ),
    db
      .select({
        itemProductId: quoteItems.productId,
        id: stockRemnants.id,
        type: sql<string>`'remnant'`,
        lotNumber: sql<string | null>`null`,
        remnantCode: stockRemnants.code,
        availableQty: sql<string>`case when ${products.unit} = 't' then ${stockRemnants.weightKg} / 1000 else ${stockRemnants.weightKg} end`,
        unit: products.unit,
        warehouseName: warehouses.name,
      })
      .from(quoteItems)
      .innerJoin(productionOrderItems, eq(productionOrderItems.quoteItemId, quoteItems.id))
      .innerJoin(stockRemnants, eq(stockRemnants.id, quoteItems.remnantId))
      .innerJoin(productionOrders, eq(productionOrders.id, productionOrderItems.orderId))
      .innerJoin(products, eq(products.id, productionOrderItems.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockRemnants.warehouseId))
      .where(
        and(
          eq(productionOrders.id, orderId),
          eq(productionOrders.tenantId, tenantId),
          eq(stockRemnants.tenantId, tenantId),
          eq(stockRemnants.status, "reservado"),
          eq(stockRemnants.reservedForQuoteId, order.quoteId),
          eq(stockRemnants.productId, productionOrderItems.productId),
          eq(warehouses.active, true),
          sql`${products.unit} in ('kg', 't')`
        )
      ),
  ]);
  const availableSources = [...reservedLots, ...reservedRemnants];
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      availableSources: availableSources.filter((source) => source.itemProductId === item.productId),
    })),
    reports,
    consumptions,
    residuals,
  };
}

export async function createProductionResidual(input: {
  tenantId: string;
  orderId: string;
  user: CurrentUserSession;
  payload: unknown;
}) {
  requireProductionCapability(input.user.role, "production.consume");
  const parsed = residualSchema.safeParse(input.payload);
  if (!parsed.success) throw new ProductionError("Medição do retalho residual inválida.");
  const command = parsed.data;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productionResiduals)
      .where(
        and(
          eq(productionResiduals.tenantId, input.tenantId),
          eq(productionResiduals.clientOperationId, command.clientOperationId)
        )
      );
    if (existing) {
      const matches =
        existing.orderId === input.orderId &&
        existing.reportId === command.reportId &&
        existing.consumptionId === command.consumptionId &&
        existing.itemId === command.orderItemId &&
        Number(existing.thicknessMm) === command.thicknessMm &&
        Number(existing.widthMm ?? 0) === (command.widthMm ?? 0) &&
        Number(existing.lengthMm ?? 0) === (command.lengthMm ?? 0) &&
        Number(existing.diameterMm ?? 0) === (command.diameterMm ?? 0) &&
        Number(existing.measuredWeightKg) === command.measuredWeightKg;
      if (!matches) throw new ProductionError("UUID de operação já usado por medição diferente.", 409);
      return existing;
    }
    const [order] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.id, input.orderId),
          eq(productionOrders.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!order) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);
    if (order.status !== "em_corte") throw new ProductionError("Retalho só pode ser registrado durante o corte.", 409);
    if (order.version !== command.expectedOrderVersion) {
      throw new ProductionError("Ordem mudou; atualize antes de registrar o retalho.", 409);
    }
    const [report] = await tx
      .select({ id: productionReports.id, reconciliationStatus: productionReports.reconciliationStatus })
      .from(productionReports)
      .where(
        and(
          eq(productionReports.id, command.reportId),
          eq(productionReports.orderId, order.id),
          eq(productionReports.tenantId, input.tenantId),
          eq(productionReports.reconciliationStatus, "aplicado")
        )
      );
    if (!report) throw new ProductionError("Retalho precisa referenciar apontamento aplicado.", 409);
    const [consumption] = await tx
      .select()
      .from(productionConsumptions)
      .where(
        and(
          eq(productionConsumptions.id, command.consumptionId),
          eq(productionConsumptions.reportId, report.id),
          eq(productionConsumptions.orderId, order.id),
          eq(productionConsumptions.itemId, command.orderItemId),
          eq(productionConsumptions.tenantId, input.tenantId)
        )
      );
    if (!consumption) throw new ProductionError("Consumo de origem não pertence ao apontamento informado.", 404);
    const residual = await createResidualInTransaction(tx, {
      tenantId: input.tenantId,
      orderId: order.id,
      itemId: command.orderItemId,
      reportId: report.id,
      consumption,
      clientOperationId: command.clientOperationId,
      thicknessMm: command.thicknessMm,
      widthMm: command.widthMm,
      lengthMm: command.lengthMm,
      diameterMm: command.diameterMm,
      measuredWeightKg: command.measuredWeightKg,
      locationAddress: command.locationAddress,
      notes: command.notes,
      userId: input.user.id,
    });
    const newVersion = order.version + 1;
    const [updatedOrder] = await tx
      .update(productionOrders)
      .set({ version: newVersion, updatedAt: new Date() })
      .where(eq(productionOrders.id, order.id))
      .returning();
    await writeAudit(tx, {
      tenantId: input.tenantId,
      userId: input.user.id,
      entity: "production_orders",
      entityId: order.id,
      action: "update",
      before: order,
      after: { ...updatedOrder, residualId: residual.id },
    });
    return residual;
  });
}
