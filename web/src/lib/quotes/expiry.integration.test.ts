/**
 * Integração com Postgres real. Só roda com RUN_DB_TESTS=1 (o CI não tem banco).
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/lib/quotes/expiry.integration.test.ts
 *
 * Cria os próprios dados (retalhos e propostas de teste) e remove tudo ao final.
 * Cobre: código de retalho sem colisão sob concorrência, expiração automática de propostas,
 * devolução do retalho reservado e auditoria da ação do sistema.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  quotes,
  stockRemnants,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { createRemnant } from "@/lib/stock/movements";
import { expireOverdueQuotes } from "./service";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `it-${Date.now()}`;

describe.skipIf(!enabled)("expiração de propostas e retalhos (Postgres real)", () => {
  const remnantIds: string[] = [];
  const quoteIds: string[] = [];
  let tenantId = "";
  let userId = "";
  let productId = "";
  let warehouseId = "";
  let template: typeof quotes.$inferSelect;

  const newQuote = async (status: string, validUntil: Date) => {
    const { id: _id, quoteNumber: _n, ...rest } = template;
    const [row] = await db
      .insert(quotes)
      .values({ ...rest, status, validUntil, notes: TAG, pdfFileKey: null })
      .returning();
    quoteIds.push(row.id);
    return row;
  };

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
    const [quote] = await db.select().from(quotes).where(eq(quotes.tenantId, tenantId)).limit(1);
    if (!quote) throw new Error("Precisa de ao menos 1 proposta no banco para servir de modelo.");
    template = quote;
  });

  afterAll(async () => {
    if (!enabled) return;
    // Limpa por marca (não só pelos ids guardados): se um teste falhar no meio, nada fica órfão.
    const tagged = await db
      .select({ id: stockRemnants.id })
      .from(stockRemnants)
      .where(eq(stockRemnants.notes, TAG));
    tagged.forEach((r) => {
      if (!remnantIds.includes(r.id)) remnantIds.push(r.id);
    });
    const entityIds = [...quoteIds, ...remnantIds];
    if (entityIds.length) await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
    if (remnantIds.length)
      await db.delete(stockRemnants).where(inArray(stockRemnants.id, remnantIds));
    if (quoteIds.length) await db.delete(quotes).where(inArray(quotes.id, quoteIds));
  });

  it("cria retalhos em paralelo sem repetir código", async () => {
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createRemnant({
          tenantId,
          userId,
          productId,
          warehouseId,
          thicknessMm: 6.35 + i,
          widthMm: 500,
          lengthMm: 800,
          locationAddress: `TESTE ${TAG}`,
          notes: TAG,
        })
      )
    );
    created.forEach((r) => remnantIds.push(r.id));
    const codes = created.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^RET-\d{5,}$/.test(c))).toBe(true);
  }, 60_000);

  it("expira só a proposta aberta e vencida, devolve o retalho e audita como sistema", async () => {
    const past = new Date(Date.now() - 3_600_000);
    const future = new Date(Date.now() + 48 * 3_600_000);

    const overdue = await newQuote("enviado", past);
    const negotiating = await newQuote("em_negociacao", past);
    const stillValid = await newQuote("enviado", future);
    const approved = await newQuote("aprovado", past);
    const draft = await newQuote("rascunho", past);

    // retalho reservado para a proposta vencida
    await db
      .update(stockRemnants)
      .set({ status: "reservado", reservedForQuoteId: overdue.id })
      .where(eq(stockRemnants.id, remnantIds[0]));

    const result = await expireOverdueQuotes();
    expect(result.errors).toEqual([]);
    expect(result.expired).toBeGreaterThanOrEqual(2);

    const status = async (id: string) =>
      (await db.select({ s: quotes.status }).from(quotes).where(eq(quotes.id, id)))[0].s;
    expect(await status(overdue.id)).toBe("expirado");
    expect(await status(negotiating.id)).toBe("expirado");
    expect(await status(stillValid.id)).toBe("enviado");
    expect(await status(approved.id)).toBe("aprovado");
    expect(await status(draft.id)).toBe("rascunho");

    const [remnant] = await db
      .select()
      .from(stockRemnants)
      .where(eq(stockRemnants.id, remnantIds[0]));
    expect(remnant.status).toBe("disponivel");
    expect(remnant.reservedForQuoteId).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "quotes"), eq(auditLog.entityId, overdue.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBeNull();
    expect(audits[0].after).toMatchObject({ status: "expirado", releasedRemnants: 1 });
  }, 60_000);

  it("é idempotente: uma segunda execução não expira nada de novo", async () => {
    const again = await expireOverdueQuotes();
    expect(again.errors).toEqual([]);
    const mine = await db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(inArray(quotes.id, quoteIds), eq(quotes.status, "enviado")));
    // só a proposta ainda válida segue como enviada
    expect(mine).toHaveLength(1);
  }, 60_000);
});
