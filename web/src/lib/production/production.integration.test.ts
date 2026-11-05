import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  productionConsumptions,
  productionOperations,
  productionOrderItems,
  productionOrders,
  productionReports,
  quoteItems,
  quotes,
  salesOrders,
  stockLots,
  stockMovements,
  stockReservations,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { convertQuoteToOrder } from "@/lib/quotes/service";
import { reserveStock } from "@/lib/stock/reservations";
import type { CurrentUserSession } from "@/lib/auth/rbac";
import {
  resolveProductionReport,
  submitProductionReport,
  transitionProductionOrder,
} from "./service";

const enabled = !!process.env.RUN_DB_TESTS;
const tag = `LAC04-${randomUUID()}`;

describe.skipIf(!enabled)("LAC-04: OP, idempotência e estoque no Postgres real", () => {
  let actor: CurrentUserSession;
  let quoteId = "";
  let salesOrderId = "";
  let productionOrderId = "";
  let itemId = "";
  let operationId = "";
  let lotId = "";
  let reservationId = "";
  let productId = "";

  beforeAll(async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) throw new Error("Banco precisa de tenant seed.");
    const [user] = await db.select().from(users).where(eq(users.tenantId, tenant.id)).limit(1);
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.tenantId, tenant.id))
      .limit(1);
    const [templateItem] = await db.select().from(quoteItems).limit(1);
    if (!user || !warehouse || !templateItem)
      throw new Error("Banco precisa de usuário, depósito e item de orçamento seed.");
    const [templateQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, templateItem.quoteId));
    if (!templateQuote) throw new Error("Orçamento seed não encontrado.");
    actor = { id: user.id, name: user.name, email: user.email, role: "admin", tenantId: tenant.id };
    productId = templateItem.productId;

    const { id: _quoteId, quoteNumber: _quoteNumber, ...quoteTemplate } = templateQuote;
    const [quote] = await db
      .insert(quotes)
      .values({ ...quoteTemplate, status: "aprovado", notes: tag, pdfFileKey: null })
      .returning();
    quoteId = quote.id;
    const { id: _itemId, ...itemTemplate } = templateItem;
    await db.insert(quoteItems).values({ ...itemTemplate, quoteId, remnantId: null, quantity: 2 });
    const salesOrder = await convertQuoteToOrder(actor.tenantId, actor.id, quoteId);
    salesOrderId = salesOrder.id;
    const [productionOrder] = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.salesOrderId, salesOrderId));
    productionOrderId = productionOrder.id;
    const [item] = await db
      .select()
      .from(productionOrderItems)
      .where(eq(productionOrderItems.orderId, productionOrderId));
    itemId = item.id;
    const [operation] = await db
      .select()
      .from(productionOperations)
      .where(eq(productionOperations.orderItemId, itemId));
    operationId = operation.id;

    const [lot] = await db
      .insert(stockLots)
      .values({
        tenantId: actor.tenantId,
        productId,
        warehouseId: warehouse.id,
        lotNumber: tag,
        quantityInitial: "2",
        quantityCurrent: "2",
        unitCost: "3",
        locationAddress: "INTEGRACAO LAC-04",
        status: "ativo",
      })
      .returning();
    lotId = lot.id;
    const reservation = await reserveStock({
      tenantId: actor.tenantId,
      sourceType: "pedido_venda",
      sourceId: salesOrderId,
      lotId,
      quantity: 2,
      userId: actor.id,
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (!quoteId) return;
    const reports = productionOrderId
      ? await db
          .select({ id: productionReports.id })
          .from(productionReports)
          .where(eq(productionReports.orderId, productionOrderId))
      : [];
    const consumptions = productionOrderId
      ? await db
          .select({ id: productionConsumptions.id, movementId: productionConsumptions.movementId })
          .from(productionConsumptions)
          .where(eq(productionConsumptions.orderId, productionOrderId))
      : [];
    const entityIds = [
      quoteId,
      salesOrderId,
      productionOrderId,
      itemId,
      operationId,
      lotId,
      reservationId,
      ...reports.map((row) => row.id),
    ].filter(Boolean);
    if (entityIds.length) await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
    if (consumptions.length)
      await db.delete(productionConsumptions).where(
        inArray(
          productionConsumptions.id,
          consumptions.map((row) => row.id)
        )
      );
    if (reports.length)
      await db.delete(productionReports).where(
        inArray(
          productionReports.id,
          reports.map((row) => row.id)
        )
      );
    if (consumptions.length)
      await db.delete(stockMovements).where(
        inArray(
          stockMovements.id,
          consumptions.map((row) => row.movementId)
        )
      );
    if (reservationId)
      await db.delete(stockReservations).where(eq(stockReservations.id, reservationId));
    if (productionOrderId)
      await db.delete(productionOrders).where(eq(productionOrders.id, productionOrderId));
    if (salesOrderId) await db.delete(salesOrders).where(eq(salesOrders.id, salesOrderId));
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    if (lotId) await db.delete(stockLots).where(eq(stockLots.id, lotId));
    await db.delete(quotes).where(eq(quotes.id, quoteId));
  });

  it("baixa reserva apenas uma vez, preserva conflito sem baixa e exige cancelamento formal do saldo", async () => {
    await expect(
      transitionProductionOrder({
        tenantId: actor.tenantId,
        orderId: productionOrderId,
        user: { ...actor, role: "vendedor" },
        payload: { target: "liberada", expectedVersion: 1 },
      })
    ).rejects.toThrow(/permissão/);
    await expect(
      transitionProductionOrder({
        tenantId: randomUUID(),
        orderId: productionOrderId,
        user: actor,
        payload: { target: "liberada", expectedVersion: 1 },
      })
    ).rejects.toThrow(/não encontrada/);

    await transitionProductionOrder({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: { target: "liberada", expectedVersion: 1 },
    });
    await transitionProductionOrder({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: { target: "em_corte", expectedVersion: 2 },
    });

    const envelope = {
      clientOperationId: randomUUID(),
      deviceId: randomUUID(),
      sequence: 1,
      payloadVersion: 1,
      expectedOrderVersion: 3,
      operatorId: actor.id,
      localOccurredAt: new Date().toISOString(),
      operationId,
      payload: {
        kind: "production",
        orderItemId: itemId,
        completedQty: 1,
        consumptions: [{ sourceType: "lot", sourceId: lotId, quantity: 1 }],
        residuals: [],
      },
    };
    const first = await submitProductionReport({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: envelope,
    });
    expect(first.report.reconciliationStatus).toBe("aplicado");
    const retry = await submitProductionReport({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: envelope,
    });
    expect(retry.replayed).toBe(true);
    expect(
      await db
        .select()
        .from(productionConsumptions)
        .where(eq(productionConsumptions.reportId, first.report.id))
    ).toHaveLength(1);
    expect(
      (await db.select().from(stockLots).where(eq(stockLots.id, lotId)))[0].quantityCurrent
    ).toBe("1.0000");
    expect(
      (await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)))[0]
        .consumedQuantity
    ).toBe("1.0000");

    const stale = await submitProductionReport({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: { ...envelope, clientOperationId: randomUUID(), sequence: 2 },
    });
    expect(stale.report.reconciliationStatus).toBe("conflito");
    expect(
      (await db.select().from(stockLots).where(eq(stockLots.id, lotId)))[0].quantityCurrent
    ).toBe("1.0000");
    await expect(
      transitionProductionOrder({
        tenantId: actor.tenantId,
        orderId: productionOrderId,
        user: actor,
        payload: { target: "concluida", expectedVersion: 4 },
      })
    ).rejects.toThrow(/pendentes/);
    await resolveProductionReport({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      reportId: stale.report.id,
      user: actor,
      reason: "Versão obsoleta",
    });
    await expect(
      transitionProductionOrder({
        tenantId: actor.tenantId,
        orderId: productionOrderId,
        user: actor,
        payload: { target: "concluida", expectedVersion: 4 },
      })
    ).rejects.toThrow(/Cancele exatamente o saldo/);
    const closed = await transitionProductionOrder({
      tenantId: actor.tenantId,
      orderId: productionOrderId,
      user: actor,
      payload: {
        target: "concluida",
        expectedVersion: 4,
        reason: "Saldo cancelado",
        cancelledItems: [{ itemId, quantity: 1, reason: "Saldo cancelado" }],
      },
    });
    expect(closed.status).toBe("concluida");
    expect(
      (await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)))[0]
        .status
    ).toBe("liberada");
  }, 60_000);
});
