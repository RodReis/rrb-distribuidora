import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  productionOrderItems,
  productionOrders,
  quoteItems,
  quotes,
  salesOrders,
  shipmentEvents,
  shipmentItems,
  shipments,
  tenants,
  users,
} from "@/lib/db/schema";
import { addShipmentEvent, deliverShipment, dispatchShipment, prepareShipment } from "./service";

const enabled = !!process.env.RUN_DB_TESTS;

describe.skipIf(!enabled)("LAC-10 (PostgreSQL real)", () => {
  let tenantId = "";
  let otherTenantId = "";
  let userId = "";
  let saleId = "";
  let productionId = "";
  let shipmentId = "";

  beforeAll(async () => {
    const foundTenants = await db.select({ id: tenants.id }).from(tenants).limit(2);
    if (foundTenants.length < 2) throw new Error("Teste requer dois tenants locais.");
    tenantId = foundTenants[0].id;
    otherTenantId = foundTenants[1].id;
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);
    const [quote] = await db.select().from(quotes).where(eq(quotes.tenantId, tenantId)).limit(1);
    if (!user || !quote) throw new Error("Teste requer usuário e orçamento locais.");
    userId = user.id;
    const sourceItems = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id));
    if (!sourceItems.length) throw new Error("Teste requer itens de orçamento.");
    const [sale] = await db
      .insert(salesOrders)
      .values({
        tenantId,
        quoteId: quote.id,
        customerId: quote.customerId,
        totalAmount: quote.totalAmount,
        orderStatus: "pronto_faturamento",
        createdBy: userId,
      })
      .returning();
    saleId = sale.id;
    const [production] = await db
      .insert(productionOrders)
      .values({ tenantId, salesOrderId: saleId, status: "concluida", createdBy: userId })
      .returning();
    productionId = production.id;
    await db.insert(productionOrderItems).values(
      sourceItems.map((item) => ({
        orderId: productionId,
        quoteItemId: item.id,
        productId: item.productId,
        plannedQty: String(item.quantity),
        completedQty: String(item.quantity),
        specSnapshot: {},
      }))
    );
  });

  afterAll(async () => {
    if (shipmentId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, shipmentId));
      await db.delete(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId));
      await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
      await db.delete(shipments).where(eq(shipments.id, shipmentId));
    }
    if (productionId) {
      await db.delete(productionOrderItems).where(eq(productionOrderItems.orderId, productionId));
      await db.delete(productionOrders).where(eq(productionOrders.id, productionId));
    }
    if (saleId) {
      await db.delete(auditLog).where(eq(auditLog.entityId, saleId));
      await db.delete(salesOrders).where(eq(salesOrders.id, saleId));
    }
  });

  it("prepara pedido concluído e rejeita acesso de outro tenant", async () => {
    const shipment = await prepareShipment(
      { tenantId, id: userId },
      {
        salesOrderId: saleId,
        origin: "Depósito local",
        destination: "Cliente teste",
        volumeCount: 2,
      }
    );
    shipmentId = shipment.id;
    await expect(
      prepareShipment(
        { tenantId: otherTenantId, id: userId },
        { salesOrderId: saleId, origin: "Outro", destination: "Outro", volumeCount: 1 }
      )
    ).rejects.toThrow("não encontrado neste tenant");
    const [item] = await db
      .select()
      .from(shipmentItems)
      .where(eq(shipmentItems.shipmentId, shipmentId));
    expect(item.quantity).toBeGreaterThan(0);
  });

  it("despacho com mesma chave não duplica evento; tenant errado não consulta", async () => {
    const actor = { tenantId, id: userId };
    const key = randomUUID();
    const first = await dispatchShipment(actor, shipmentId, key);
    const retry = await dispatchShipment(actor, shipmentId, key);
    expect(retry.id).toBe(first.id);
    expect(retry.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    const events = await db
      .select()
      .from(shipmentEvents)
      .where(and(eq(shipmentEvents.shipmentId, shipmentId), eq(shipmentEvents.type, "despacho")));
    expect(events).toHaveLength(1);
    await expect(
      dispatchShipment({ tenantId: otherTenantId, id: userId }, shipmentId, key)
    ).rejects.toThrow("não encontrada neste tenant");
    await expect(dispatchShipment(actor, shipmentId, randomUUID())).rejects.toThrow("outra chave");
  });

  it("impede evento que simula entrega e mantém correção após entrega", async () => {
    const actor = { tenantId, id: userId };
    await expect(
      addShipmentEvent(actor, shipmentId, { type: "entrega", occurredAt: new Date() })
    ).rejects.toThrow("ação própria");
    await deliverShipment(actor, shipmentId, { occurredAt: new Date() });
    await expect(
      addShipmentEvent(actor, shipmentId, { type: "transito", occurredAt: new Date() })
    ).rejects.toThrow("somente correção");
    const correction = await addShipmentEvent(actor, shipmentId, {
      type: "correcao",
      occurredAt: new Date(),
      evidenceRef: "Ajuste manual de local",
    });
    expect(correction.source).toBe("manual");
  });
});
