import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  auditLog,
  purchaseOrderItems,
  purchaseOrders,
  supplierDeliveryEvents,
  suppliers,
  tenants,
  users,
} from "@/lib/db/schema";
import { correctSupplierDeliveryEvent } from "./service";

const id = () => crypto.randomUUID();
const tenantId = id();
const userId = id();
const supplierId = id();
const productId = id();
const orderId = id();
const itemId = id();
const eventId = id();
const enabled = !!process.env.RUN_DB_TESTS;

describe.skipIf(!enabled)("correção compensatória de evento de fornecedor", () => {
  beforeAll(async () => {
    await db.insert(tenants).values({
      id: tenantId,
      name: "Tenant Correção LAC02",
      slug: `lac02-${tenantId.slice(0, 8)}`,
    });
    await db.insert(users).values({
      id: userId,
      tenantId,
      name: "PI Correção",
      email: `${tenantId}@example.test`,
      passwordHash: "integration-only",
      role: "admin",
    });
    await db.insert(suppliers).values({
      id: supplierId,
      tenantId,
      legalName: "Fornecedor Correção",
      cnpj: `${tenantId.replaceAll("-", "").slice(0, 14)}`,
      type: "distribuidor",
    });
    await db.insert(products).values({
      id: productId,
      tenantId,
      sku: `COR-${tenantId.slice(0, 8)}`,
      family: "chapa_grossa",
      commercialDescription: "Produto teste",
      fiscalDescription: "Produto teste",
      norm: "ASTM A36",
      ncm: "72085100",
      weightPerUnit: "1",
      replacementCostBase: "1",
      unit: "kg",
    });
    await db
      .insert(purchaseOrders)
      .values({ id: orderId, tenantId, supplierId, createdBy: userId, status: "emitido" });
    await db.insert(purchaseOrderItems).values({
      id: itemId,
      tenantId,
      purchaseOrderId: orderId,
      productId,
      productDescriptionSnapshot: "Produto teste",
      quantityOrdered: "10",
      unit: "kg",
      unitPrice: "1",
      lineTotal: "10",
    });
    await db.insert(supplierDeliveryEvents).values({
      id: eventId,
      tenantId,
      purchaseOrderId: orderId,
      eventType: "promise_confirmed",
      eventAt: new Date("2026-10-01T12:00:00Z"),
      promisedAt: new Date("2026-10-10T12:00:00Z"),
      source: "follow_up_manual",
      actorId: userId,
    });
  });

  afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("preserva original, grava substituto auditável e bloqueia segunda substituição direta", async () => {
    const replacement = await correctSupplierDeliveryEvent({
      tenantId,
      userId,
      role: "admin",
      purchaseOrderId: orderId,
      eventId,
      eventAt: "2026-10-01T12:00:00.000Z",
      promisedAt: "2026-10-12T12:00:00.000Z",
      itemId: null,
      quantity: null,
      reason: "Data informada incorretamente",
    });
    expect(replacement.compensatesEventId).toBe(eventId);
    expect(replacement.correctionReason).toBe("Data informada incorretamente");

    const rows = await db
      .select()
      .from(supplierDeliveryEvents)
      .where(
        and(
          eq(supplierDeliveryEvents.tenantId, tenantId),
          eq(supplierDeliveryEvents.purchaseOrderId, orderId)
        )
      );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === eventId)?.promisedAt?.toISOString()).toBe(
      "2026-10-10T12:00:00.000Z"
    );
    expect(rows.find((row) => row.id === replacement.id)?.promisedAt?.toISOString()).toBe(
      "2026-10-12T12:00:00.000Z"
    );

    await expect(
      correctSupplierDeliveryEvent({
        tenantId,
        userId,
        role: "admin",
        purchaseOrderId: orderId,
        eventId,
        eventAt: "2026-10-01T12:00:00.000Z",
        promisedAt: "2026-10-14T12:00:00.000Z",
        itemId: null,
        quantity: null,
        reason: "Nova tentativa de alterar promessa",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
