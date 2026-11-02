/**
 * Integração com Postgres real. Só roda com RUN_DB_TESTS=1 (o CI não tem banco).
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/lib/quotes/order-flow.integration.test.ts
 *
 * Cobre o fluxo orçamento → reserva de retalho → aprovação → pedido (débito OR3):
 * consumo do retalho, atomicidade da conversão, idempotência e reserva concorrente.
 * Cria os próprios dados e remove tudo ao final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  quoteItems,
  quotes,
  salesOrders,
  stockRemnants,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { createRemnant, releaseRemnant, reserveRemnant } from "@/lib/stock/movements";
import { changeQuoteStatus, convertQuoteToOrder } from "./service";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `flow-${Date.now()}`;

describe.skipIf(!enabled)("fluxo orçamento → reserva → pedido (Postgres real)", () => {
  const remnantIds: string[] = [];
  const quoteIds: string[] = [];
  let tenantId = "";
  let userId = "";
  let productId = "";
  let warehouseId = "";
  let templateQuote: typeof quotes.$inferSelect;
  let templateItem: typeof quoteItems.$inferSelect;

  const newRemnant = async () => {
    const r = await createRemnant({
      tenantId,
      userId,
      productId,
      warehouseId,
      thicknessMm: 6.35,
      widthMm: 500,
      lengthMm: 800,
      locationAddress: `TESTE ${TAG}`,
      notes: TAG,
    });
    remnantIds.push(r.id);
    return r;
  };

  /** Orçamento com um item que usa o retalho informado. */
  const newQuote = async (status: string, remnantId: string | null) => {
    const { id: _id, quoteNumber: _n, ...header } = templateQuote;
    const [quote] = await db
      .insert(quotes)
      .values({ ...header, status, notes: TAG, pdfFileKey: null })
      .returning();
    quoteIds.push(quote.id);
    const { id: _itemId, ...item } = templateItem;
    await db.insert(quoteItems).values({ ...item, quoteId: quote.id, remnantId });
    return quote;
  };

  const remnantStatus = async (id: string) =>
    (await db.select().from(stockRemnants).where(eq(stockRemnants.id, id)))[0];

  beforeAll(async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    tenantId = tenant.id;
    const [user] = await db.select().from(users).where(eq(users.tenantId, tenantId)).limit(1);
    userId = user.id;
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.status, "ativo")))
      .limit(1);
    productId = product.id;
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.tenantId, tenantId))
      .limit(1);
    warehouseId = warehouse.id;

    const [item] = await db.select().from(quoteItems).limit(1);
    if (!item) throw new Error("Precisa de ao menos 1 item de orçamento no banco como modelo.");
    templateItem = item;
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, item.quoteId)).limit(1);
    templateQuote = quote;
  });

  afterAll(async () => {
    if (!enabled) return;
    const tagged = await db
      .select({ id: stockRemnants.id })
      .from(stockRemnants)
      .where(eq(stockRemnants.notes, TAG));
    tagged.forEach((r) => {
      if (!remnantIds.includes(r.id)) remnantIds.push(r.id);
    });
    const orders = quoteIds.length
      ? await db
          .select({ id: salesOrders.id })
          .from(salesOrders)
          .where(inArray(salesOrders.quoteId, quoteIds))
      : [];
    const entityIds = [...quoteIds, ...remnantIds, ...orders.map((o) => o.id)];
    if (entityIds.length) await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
    if (orders.length)
      await db.delete(salesOrders).where(
        inArray(
          salesOrders.id,
          orders.map((o) => o.id)
        )
      );
    if (quoteIds.length) await db.delete(quoteItems).where(inArray(quoteItems.quoteId, quoteIds));
    if (remnantIds.length)
      await db.delete(stockRemnants).where(inArray(stockRemnants.id, remnantIds));
    if (quoteIds.length) await db.delete(quotes).where(inArray(quotes.id, quoteIds));
  });

  it("reserva, aprova e converte: o retalho é consumido e o pedido nasce uma única vez", async () => {
    const remnant = await newRemnant();
    const quote = await newQuote("em_negociacao", remnant.id);

    await reserveRemnant(remnant.id, tenantId, quote.id, userId);
    expect((await remnantStatus(remnant.id)).status).toBe("reservado");

    await changeQuoteStatus(tenantId, userId, quote.id, "aprovado");
    const order = await convertQuoteToOrder(tenantId, userId, quote.id);
    expect(order.quoteId).toBe(quote.id);
    expect(order.orderStatus).toBe("aguardando_producao");
    expect((await remnantStatus(remnant.id)).status).toBe("consumido");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "sales_orders"), eq(auditLog.entityId, order.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({ consumedRemnants: 1 });

    await expect(convertQuoteToOrder(tenantId, userId, quote.id)).rejects.toThrow(
      /já foi convertido/
    );
    const orders = await db.select().from(salesOrders).where(eq(salesOrders.quoteId, quote.id));
    expect(orders).toHaveLength(1);
  }, 60_000);

  it("aborta a conversão inteira se a reserva do retalho sumiu (sem pedido órfão)", async () => {
    const remnant = await newRemnant();
    const quote = await newQuote("em_negociacao", remnant.id);
    await reserveRemnant(remnant.id, tenantId, quote.id, userId);
    await changeQuoteStatus(tenantId, userId, quote.id, "aprovado");

    await releaseRemnant(remnant.id, tenantId, userId);

    await expect(convertQuoteToOrder(tenantId, userId, quote.id)).rejects.toThrow(
      /não estão mais disponíveis/
    );
    const orders = await db.select().from(salesOrders).where(eq(salesOrders.quoteId, quote.id));
    expect(orders).toHaveLength(0);
    expect((await remnantStatus(remnant.id)).status).toBe("disponivel");
  }, 60_000);

  it("só converte orçamento aprovado", async () => {
    const quote = await newQuote("enviado", null);
    await expect(convertQuoteToOrder(tenantId, userId, quote.id)).rejects.toThrow(
      /Apenas orçamentos aprovados/
    );
  }, 60_000);

  it("reservas simultâneas do mesmo retalho: só uma vence", async () => {
    const remnant = await newRemnant();
    const quoteA = await newQuote("enviado", remnant.id);
    const quoteB = await newQuote("enviado", remnant.id);

    const results = await Promise.allSettled([
      reserveRemnant(remnant.id, tenantId, quoteA.id, userId),
      reserveRemnant(remnant.id, tenantId, quoteB.id, userId),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const final = await remnantStatus(remnant.id);
    expect(final.status).toBe("reservado");
    expect([quoteA.id, quoteB.id]).toContain(final.reservedForQuoteId);
  }, 60_000);
});
