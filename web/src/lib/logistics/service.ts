import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  auditLog,
  importTracking,
  productionOrderItems,
  productionOrders,
  purchaseOrders,
  quoteItems,
  salesOrders,
  shipmentEvents,
  shipmentItems,
  shipments,
} from "@/lib/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { LogisticsError } from "./errors";
import { etaLabel } from "./capabilities";

type Actor = { tenantId: string; id: string };

export async function listShipments(tenantId: string) {
  const rows = await db
    .select()
    .from(shipments)
    .where(eq(shipments.tenantId, tenantId))
    .orderBy(asc(shipments.createdAt));
  return Promise.all(
    rows.map(async (shipment) => ({
      ...shipment,
      items: await db
        .select()
        .from(shipmentItems)
        .where(
          and(eq(shipmentItems.tenantId, tenantId), eq(shipmentItems.shipmentId, shipment.id))
        ),
      events: (
        await db
          .select()
          .from(shipmentEvents)
          .where(
            and(eq(shipmentEvents.tenantId, tenantId), eq(shipmentEvents.shipmentId, shipment.id))
          )
          .orderBy(asc(shipmentEvents.createdAt))
      ).map((event) => ({ ...event, etaStatus: etaLabel(event.eta) })),
    }))
  );
}

export async function listEligibleOrders(tenantId: string) {
  return db
    .select({ id: salesOrders.id, number: salesOrders.orderNumber })
    .from(salesOrders)
    .innerJoin(
      productionOrders,
      and(
        eq(productionOrders.salesOrderId, salesOrders.id),
        eq(productionOrders.tenantId, tenantId)
      )
    )
    .leftJoin(
      shipments,
      and(eq(shipments.salesOrderId, salesOrders.id), eq(shipments.tenantId, tenantId))
    )
    .where(
      and(
        eq(salesOrders.tenantId, tenantId),
        eq(salesOrders.orderStatus, "pronto_faturamento"),
        eq(productionOrders.status, "concluida"),
        isNull(shipments.id)
      )
    )
    .orderBy(asc(salesOrders.orderNumber));
}

export async function prepareShipment(
  actor: Actor,
  input: {
    salesOrderId: string;
    origin: string;
    destination: string;
    volumeCount: number;
    carrier?: string | null;
    plannedAt?: Date | null;
  }
) {
  if (
    !input.origin.trim() ||
    !input.destination.trim() ||
    !Number.isInteger(input.volumeCount) ||
    input.volumeCount < 1
  )
    throw new LogisticsError("Informe origem, destino e quantidade válida de volumes.");
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.id, input.salesOrderId), eq(salesOrders.tenantId, actor.tenantId)))
      .for("update");
    if (!sale) throw new LogisticsError("Pedido não encontrado neste tenant.", 404);
    if (sale.orderStatus !== "pronto_faturamento")
      throw new LogisticsError("Pedido precisa estar pronto para faturamento.", 409);
    const [existing] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.tenantId, actor.tenantId), eq(shipments.salesOrderId, sale.id)));
    if (existing) throw new LogisticsError("Pedido já possui romaneio.", 409);
    const [production] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.tenantId, actor.tenantId),
          eq(productionOrders.salesOrderId, sale.id)
        )
      )
      .for("update");
    if (!production || production.status !== "concluida")
      throw new LogisticsError("Produção precisa estar concluída.", 409);
    const planned = await tx
      .select({
        quoteItem: quoteItems,
        productionItem: productionOrderItems,
      })
      .from(productionOrderItems)
      .innerJoin(quoteItems, eq(quoteItems.id, productionOrderItems.quoteItemId))
      .where(eq(productionOrderItems.orderId, production.id));
    if (!planned.length) throw new LogisticsError("Pedido sem itens produzidos.", 409);
    const expectedItems = await tx
      .select({ id: quoteItems.id })
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, sale.quoteId));
    const plannedIds = new Set(planned.map(({ quoteItem }) => quoteItem.id));
    if (
      plannedIds.size !== expectedItems.length ||
      expectedItems.some(({ id }) => !plannedIds.has(id))
    )
      throw new LogisticsError("Produção não cobre todos os itens do pedido.", 409);
    for (const item of planned) {
      if (
        Number(item.productionItem.completedQty) < item.quoteItem.quantity ||
        Number(item.productionItem.cancelledQty) > 0
      ) {
        throw new LogisticsError("Produção incompleta ou cancelada para item do pedido.", 409);
      }
      if (!(Number(item.quoteItem.grossWeightKg) > 0))
        throw new LogisticsError("Peso bruto inválido no item do pedido.", 409);
    }
    const [shipment] = await tx
      .insert(shipments)
      .values({
        tenantId: actor.tenantId,
        salesOrderId: sale.id,
        origin: input.origin.trim(),
        destination: input.destination.trim(),
        volumeCount: input.volumeCount,
        carrier: input.carrier?.trim() || null,
        plannedAt: input.plannedAt ?? null,
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(shipmentItems).values(
      planned.map(({ quoteItem, productionItem }) => ({
        tenantId: actor.tenantId,
        shipmentId: shipment.id,
        salesOrderItemId: quoteItem.id,
        productionOrderItemId: productionItem.id,
        quantity: quoteItem.quantity,
        weightKg: quoteItem.grossWeightKg,
        unit: "un",
      }))
    );
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      userId: actor.id,
      entity: "shipments",
      entityId: shipment.id,
      action: "insert",
      after: shipment,
    });
    return shipment;
  });
}

export async function dispatchShipment(actor: Actor, id: string, key: string) {
  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.tenantId, actor.tenantId)))
      .for("update");
    if (!shipment) throw new LogisticsError("Expedição não encontrada neste tenant.", 404);
    if (shipment.status === "despachada" || shipment.status === "entregue") {
      if (shipment.dispatchKey === key) return shipment;
      throw new LogisticsError("Expedição já despachada com outra chave.", 409);
    }
    const [sale] = await tx
      .select()
      .from(salesOrders)
      .where(
        and(eq(salesOrders.id, shipment.salesOrderId), eq(salesOrders.tenantId, actor.tenantId))
      )
      .for("update");
    if (!sale || sale.orderStatus !== "pronto_faturamento")
      throw new LogisticsError("Pedido deixou de estar elegível.", 409);
    const [production] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.tenantId, actor.tenantId),
          eq(productionOrders.salesOrderId, sale.id)
        )
      )
      .for("update");
    if (!production || production.status !== "concluida")
      throw new LogisticsError("Produção deixou de estar concluída.", 409);
    const items = await tx
      .select()
      .from(shipmentItems)
      .where(and(eq(shipmentItems.tenantId, actor.tenantId), eq(shipmentItems.shipmentId, id)))
      .orderBy(asc(shipmentItems.salesOrderItemId));
    if (!items.length) throw new LogisticsError("Romaneio sem itens.", 409);
    const expectedItems = await tx
      .select({ id: quoteItems.id })
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, sale.quoteId));
    const manifestIds = new Set(items.map((item) => item.salesOrderItemId));
    if (
      manifestIds.size !== expectedItems.length ||
      expectedItems.some(({ id }) => !manifestIds.has(id))
    )
      throw new LogisticsError("Romaneio não cobre todos os itens do pedido.", 409);
    for (const item of items) {
      const [produced] = await tx
        .select()
        .from(productionOrderItems)
        .where(
          and(
            eq(productionOrderItems.id, item.productionOrderItemId),
            eq(productionOrderItems.orderId, production.id)
          )
        );
      if (
        !produced ||
        produced.quoteItemId !== item.salesOrderItemId ||
        Number(produced.completedQty) < item.quantity ||
        Number(produced.cancelledQty) > 0
      ) {
        throw new LogisticsError("Item não possui produção elegível.", 409);
      }
    }
    const manifest = {
      orderId: sale.id,
      origin: shipment.origin,
      destination: shipment.destination,
      carrier: shipment.carrier,
      volumeCount: shipment.volumeCount,
      items: items.map((item) => ({
        itemId: item.salesOrderItemId,
        quantity: item.quantity,
        weightKg: item.weightKg,
        unit: item.unit,
      })),
    };
    const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    const now = new Date();
    const [updated] = await tx
      .update(shipments)
      .set({
        status: "despachada",
        dispatchKey: key,
        dispatchedAt: now,
        manifestHash,
        manifestBy: actor.id,
      })
      .where(and(eq(shipments.id, id), eq(shipments.tenantId, actor.tenantId)))
      .returning();
    await tx.insert(shipmentEvents).values({
      tenantId: actor.tenantId,
      shipmentId: id,
      type: "despacho",
      occurredAt: now,
      source: "manual",
      createdBy: actor.id,
    });
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      userId: actor.id,
      entity: "shipments",
      entityId: id,
      action: "update",
      before: shipment,
      after: updated,
    });
    return updated;
  });
}

export async function addShipmentEvent(
  actor: Actor,
  id: string,
  input: {
    type: string;
    occurredAt: Date;
    location?: string | null;
    evidenceRef?: string | null;
    eta?: Date | null;
  }
) {
  if (input.occurredAt.getTime() > Date.now())
    throw new LogisticsError("Evento não pode ocorrer no futuro.");
  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.tenantId, actor.tenantId)))
      .for("update");
    if (!shipment) throw new LogisticsError("Expedição não encontrada neste tenant.", 404);
    if (shipment.status === "preparada")
      throw new LogisticsError("Despache antes de registrar transporte.", 409);
    const eventType = input.type.trim().toLowerCase();
    if (["despacho", "entrega"].includes(eventType))
      throw new LogisticsError("Use a ação própria para despacho ou entrega.", 409);
    if (shipment.status === "entregue" && eventType !== "correcao")
      throw new LogisticsError("Após entrega, somente correção pode ser registrada.", 409);
    if (eventType === "correcao" && !input.evidenceRef?.trim())
      throw new LogisticsError("Correção exige referência da evidência ou justificativa.");
    const [event] = await tx
      .insert(shipmentEvents)
      .values({
        tenantId: actor.tenantId,
        shipmentId: id,
        type: eventType,
        occurredAt: input.occurredAt,
        source: "manual",
        location: input.location?.trim() || null,
        evidenceRef: input.evidenceRef?.trim() || null,
        eta: input.eta ?? null,
        createdBy: actor.id,
      })
      .returning();
    return event;
  });
}

export async function deliverShipment(
  actor: Actor,
  id: string,
  input: { occurredAt: Date; evidenceRef?: string | null }
) {
  if (input.occurredAt.getTime() > Date.now())
    throw new LogisticsError("Entrega não pode ocorrer no futuro.");
  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.tenantId, actor.tenantId)))
      .for("update");
    if (!shipment) throw new LogisticsError("Expedição não encontrada neste tenant.", 404);
    if (shipment.status !== "despachada")
      throw new LogisticsError("Somente expedição despachada pode ser entregue.", 409);
    if (shipment.dispatchedAt && input.occurredAt < shipment.dispatchedAt)
      throw new LogisticsError("Entrega não pode anteceder despacho.");
    const [sale] = await tx
      .select()
      .from(salesOrders)
      .where(
        and(eq(salesOrders.id, shipment.salesOrderId), eq(salesOrders.tenantId, actor.tenantId))
      )
      .for("update");
    if (!sale || sale.orderStatus !== "pronto_faturamento")
      throw new LogisticsError("Pedido não está apto para entrega.", 409);
    const [updated] = await tx
      .update(shipments)
      .set({ status: "entregue", deliveredAt: input.occurredAt })
      .where(eq(shipments.id, id))
      .returning();
    await tx.insert(shipmentEvents).values({
      tenantId: actor.tenantId,
      shipmentId: id,
      type: "entrega",
      occurredAt: input.occurredAt,
      source: "manual",
      evidenceRef: input.evidenceRef?.trim() || null,
      createdBy: actor.id,
    });
    const [deliveredSale] = await tx
      .update(salesOrders)
      .set({ orderStatus: "entregue" })
      .where(and(eq(salesOrders.id, sale.id), eq(salesOrders.tenantId, actor.tenantId)))
      .returning();
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      userId: actor.id,
      entity: "sales_orders",
      entityId: sale.id,
      action: "update",
      before: sale,
      after: deliveredSale,
    });
    await tx.insert(auditLog).values({
      tenantId: actor.tenantId,
      userId: actor.id,
      entity: "shipments",
      entityId: id,
      action: "update",
      before: shipment,
      after: updated,
    });
    return updated;
  });
}

export async function listImportTracking(tenantId: string) {
  const rows = await db
    .select()
    .from(importTracking)
    .where(eq(importTracking.tenantId, tenantId))
    .orderBy(asc(importTracking.createdAt));
  return rows.map((row) => ({ ...row, etaStatus: etaLabel(row.eta) }));
}

export async function listImportOrders(tenantId: string) {
  return db
    .select({ id: purchaseOrders.id, number: purchaseOrders.number, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.tenantId, tenantId),
        inArray(purchaseOrders.status, ["emitido", "parcialmente_recebido", "recebido_completo"])
      )
    )
    .orderBy(asc(purchaseOrders.createdAt));
}

export async function addImportMilestone(
  actor: Actor,
  input: {
    purchaseOrderId: string;
    reference: string;
    milestone: string;
    observedAt: Date;
    eta?: Date | null;
  }
) {
  if (input.observedAt.getTime() > Date.now())
    throw new LogisticsError("Marco não pode ser observado no futuro.");
  const [order] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, input.purchaseOrderId),
        eq(purchaseOrders.tenantId, actor.tenantId),
        inArray(purchaseOrders.status, ["emitido", "parcialmente_recebido", "recebido_completo"])
      )
    );
  if (!order) throw new LogisticsError("Pedido de compra não encontrado neste tenant.", 404);
  if (!input.reference.trim() || !input.milestone.trim())
    throw new LogisticsError("Informe referência e marco.");
  const [row] = await db
    .insert(importTracking)
    .values({
      tenantId: actor.tenantId,
      purchaseOrderId: order.id,
      reference: input.reference.trim(),
      milestone: input.milestone.trim(),
      observedAt: input.observedAt,
      eta: input.eta ?? null,
      source: "manual",
      createdBy: actor.id,
    })
    .returning();
  return { ...row, etaStatus: etaLabel(row.eta) };
}
