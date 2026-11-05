import { db } from "@/lib/db";
import {
  auditLog,
  productionConsumptions,
  productionReports,
  productionOperations,
  productionOrderItems,
  productionOrders,
  quoteItems,
  quotes,
  salesOrders,
  stockLots,
  stockRemnants,
  stockReservations,
  warehouses,
} from "@/lib/db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";

export class StockReservationError extends Error {}

/** Cancela pedido aberto e libera reservas na mesma transação. */
export async function cancelSalesOrder(input: {
  tenantId: string;
  orderId: string;
  userId: string;
  reason: string;
}) {
  if (input.reason.trim().length < 5) {
    throw new StockReservationError(
      "Justificativa do cancelamento deve ter ao menos 5 caracteres."
    );
  }
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.id, input.orderId), eq(salesOrders.tenantId, input.tenantId)))
      .for("update");
    if (!order) throw new StockReservationError("Pedido de venda não encontrado neste tenant.");
    if (!["aguardando_producao", "em_corte"].includes(order.orderStatus)) {
      throw new StockReservationError(
        "Somente pedido aguardando produção ou em corte pode ser cancelado."
      );
    }
    const [productionOrder] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.tenantId, input.tenantId),
          eq(productionOrders.salesOrderId, order.id)
        )
      )
      .for("update");
    if (productionOrder && ["concluida", "cancelada"].includes(productionOrder.status)) {
      throw new StockReservationError("Ordem de produção já está encerrada.");
    }
    if (productionOrder) {
      const pending = await tx
        .select({ id: productionReports.id })
        .from(productionReports)
        .where(
          and(
            eq(productionReports.orderId, productionOrder.id),
            inArray(productionReports.reconciliationStatus, [
              "pendente",
              "aguardando_aprovacao",
              "aprovado",
              "conflito",
            ])
          )
        );
      if (pending.length) {
        throw new StockReservationError(
          "Resolva apontamentos pendentes pela ordem de produção antes do cancelamento."
        );
      }
    }
    if (productionOrder) {
      const [consumed] = await tx
        .select({ quantity: sql<string>`coalesce(sum(${productionConsumptions.quantity}), 0)` })
        .from(productionConsumptions)
        .where(eq(productionConsumptions.orderId, productionOrder.id));
      if (Number(consumed?.quantity ?? 0) > 0 && input.reason.trim().length < 10) {
        throw new StockReservationError(
          "Cancelamento após consumo exige justificativa de ao menos 10 caracteres."
        );
      }
      const [cancelledProduction] = await tx
        .update(productionOrders)
        .set({ status: "cancelada", version: productionOrder.version + 1, updatedAt: new Date() })
        .where(eq(productionOrders.id, productionOrder.id))
        .returning();
      await tx.insert(auditLog).values({
        tenantId: input.tenantId,
        userId: input.userId,
        entity: "production_orders",
        entityId: productionOrder.id,
        action: "update",
        before: productionOrder,
        after: { ...cancelledProduction, cancellationReason: input.reason.trim() },
      });
      const itemRows = await tx
        .select({ id: productionOrderItems.id })
        .from(productionOrderItems)
        .where(eq(productionOrderItems.orderId, productionOrder.id));
      if (itemRows.length) {
        await tx
          .update(productionOperations)
          .set({ status: "cancelada", endedAt: new Date() })
          .where(inArray(productionOperations.orderItemId, itemRows.map((row) => row.id)));
      }
    }
    const [updated] = await tx
      .update(salesOrders)
      .set({ orderStatus: "cancelado" })
      .where(and(eq(salesOrders.id, order.id), eq(salesOrders.tenantId, input.tenantId)))
      .returning();
    const active = await tx
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.tenantId, input.tenantId),
          eq(stockReservations.sourceType, "pedido_venda"),
          eq(stockReservations.sourceId, order.id),
          eq(stockReservations.status, "ativa")
        )
      )
      .for("update");
    for (const current of active) {
      const [reservation] = await tx
        .update(stockReservations)
        .set({ status: "liberada", releasedAt: new Date() })
        .where(eq(stockReservations.id, current.id))
        .returning();
      await tx.insert(auditLog).values({
        tenantId: input.tenantId,
        userId: input.userId,
        entity: "stock_reservations",
        entityId: current.id,
        action: "update",
        before: current,
        after: { ...reservation, releaseReason: "pedido_cancelado", orderId: order.id },
      });
    }
    const reservedRemnants = await tx
      .select()
      .from(stockRemnants)
      .where(
        and(
          eq(stockRemnants.tenantId, input.tenantId),
          eq(stockRemnants.reservedForQuoteId, order.quoteId),
          eq(stockRemnants.status, "reservado")
        )
      )
      .for("update");
    for (const remnant of reservedRemnants) {
      const [released] = await tx
        .update(stockRemnants)
        .set({ status: "disponivel", reservedForQuoteId: null, updatedAt: new Date() })
        .where(eq(stockRemnants.id, remnant.id))
        .returning();
      await tx.insert(auditLog).values({
        tenantId: input.tenantId,
        userId: input.userId,
        entity: "stock_remnants",
        entityId: remnant.id,
        action: "update",
        before: remnant,
        after: { ...released, releaseReason: "pedido_producao_cancelado", orderId: order.id },
      });
    }
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "sales_orders",
      entityId: order.id,
      action: "update",
      before: order,
      after: {
        ...updated,
        cancellationReason: input.reason.trim(),
        releasedReservations: active.length,
        releasedRemnants: reservedRemnants.length,
      },
    });
    return {
      order: updated,
      releasedReservations: active.length,
      releasedRemnants: reservedRemnants.length,
    };
  });
}

/** Reserve explicit lot/warehouse. Lock lot row so concurrent requests cannot oversell. */
export async function reserveStock(input: {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  lotId: string;
  quantity: number;
  userId: string;
}) {
  if (
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0 ||
    !input.sourceType.trim() ||
    input.sourceType.length > 30 ||
    !input.sourceId ||
    !input.lotId
  ) {
    throw new StockReservationError("Origem e quantidade da reserva são inválidas.");
  }
  if (input.sourceType !== "pedido_venda") {
    throw new StockReservationError("Reserva comercial exige pedido de venda confirmado.");
  }
  return db.transaction(async (tx) => {
    const [lockedOrder] = await tx
      .select({ id: salesOrders.id, quoteId: salesOrders.quoteId })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.id, input.sourceId),
          eq(salesOrders.tenantId, input.tenantId),
          inArray(salesOrders.orderStatus, ["aguardando_producao", "em_corte"])
        )
      )
      .for("update");
    const [order] = lockedOrder
      ? await tx
          .select({ id: salesOrders.id, quoteId: salesOrders.quoteId })
          .from(salesOrders)
          .innerJoin(quotes, eq(quotes.id, salesOrders.quoteId))
          .where(and(eq(salesOrders.id, lockedOrder.id), eq(quotes.status, "aprovado")))
      : [];
    if (!order) throw new StockReservationError("Pedido confirmado não encontrado neste tenant.");

    const [lot] = await tx
      .select({
        id: stockLots.id,
        productId: stockLots.productId,
        warehouseId: stockLots.warehouseId,
        quantityCurrent: stockLots.quantityCurrent,
      })
      .from(stockLots)
      .where(
        and(
          eq(stockLots.id, input.lotId),
          eq(stockLots.tenantId, input.tenantId),
          eq(stockLots.status, "ativo")
        )
      )
      .for("update");
    if (!lot) throw new StockReservationError("Lote ativo não encontrado neste tenant.");
    const [orderItem] = await tx
      .select({ id: quoteItems.id })
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, order.quoteId), eq(quoteItems.productId, lot.productId)))
      .limit(1);
    if (!orderItem)
      throw new StockReservationError("Produto não pertence ao pedido de venda informado.");

    const [warehouse] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, lot.warehouseId),
          eq(warehouses.tenantId, input.tenantId),
          eq(warehouses.active, true)
        )
      );
    if (!warehouse) throw new StockReservationError("Depósito inativo ou fora deste tenant.");

    const [reserved] = await tx
      .select({
        quantity: sql<string>`coalesce(sum(${stockReservations.quantity} - ${stockReservations.consumedQuantity}), 0)`,
      })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.lotId, lot.id),
          eq(stockReservations.tenantId, input.tenantId),
          eq(stockReservations.status, "ativa")
        )
      );
    const available = Number(lot.quantityCurrent) - Number(reserved?.quantity ?? 0);
    if (input.quantity > available)
      throw new StockReservationError(`Saldo disponível insuficiente (${Math.max(0, available)}).`);

    const [created] = await tx
      .insert(stockReservations)
      .values({
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        productId: lot.productId,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        quantity: String(input.quantity),
        reservedBy: input.userId,
      })
      .returning();
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_reservations",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });
    return created;
  });
}

export async function releaseStockReservation(input: {
  tenantId: string;
  reservationId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const [reservationRef] = await tx
      .select({ sourceType: stockReservations.sourceType, sourceId: stockReservations.sourceId })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.id, input.reservationId),
          eq(stockReservations.tenantId, input.tenantId)
        )
      );
    if (!reservationRef) throw new StockReservationError("Reserva não encontrada neste tenant.");
    if (reservationRef.sourceType === "pedido_venda") {
      await tx
        .select({ id: salesOrders.id })
        .from(salesOrders)
        .where(
          and(eq(salesOrders.id, reservationRef.sourceId), eq(salesOrders.tenantId, input.tenantId))
        )
        .for("update");
    }
    const [current] = await tx
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.id, input.reservationId),
          eq(stockReservations.tenantId, input.tenantId)
        )
      )
      .for("update");
    if (!current) throw new StockReservationError("Reserva não encontrada neste tenant.");
    if (current.status === "liberada") return current;
    if (current.status !== "ativa")
      throw new StockReservationError("Estado da reserva não permite liberação.");
    const [reservation] = await tx
      .update(stockReservations)
      .set({ status: "liberada", releasedAt: new Date() })
      .where(eq(stockReservations.id, current.id))
      .returning();
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_reservations",
      entityId: reservation.id,
      action: "update",
      before: current,
      after: reservation,
    });
    return reservation;
  });
}
