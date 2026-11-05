import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries, tenantMarketPriceSeries, tenants } from "@/lib/db/schema";
import { upsertTenantDailyBars } from "./series-store";
import { getSeries } from "./queries";

const enabled = !!process.env.RUN_DB_TESTS;
const tag = randomUUID().slice(0, 8);

describe.skipIf(!enabled)("LAC-05 (Postgres real)", () => {
  let assetId = "";
  let tenantA = "";
  let tenantB = "";

  afterAll(async () => {
    if (assetId) await db.delete(marketAssets).where(eq(marketAssets.id, assetId));
    if (tenantA) await db.delete(tenants).where(eq(tenants.id, tenantA));
    if (tenantB) await db.delete(tenants).where(eq(tenants.id, tenantB));
  });

  it("separa séries, permite datas iguais e mantém metadados da importação", async () => {
    const [a] = await db
      .insert(tenants)
      .values({ name: `LAC05 A ${tag}`, slug: `lac05-a-${tag}` })
      .returning();
    const [b] = await db
      .insert(tenants)
      .values({ name: `LAC05 B ${tag}`, slug: `lac05-b-${tag}` })
      .returning();
    tenantA = a.id;
    tenantB = b.id;
    const [asset] = await db
      .insert(marketAssets)
      .values({
        symbol: `LAC05-${tag}`,
        name: "Histórico próprio",
        market: "TESTE",
        baseCurrency: "BRL",
        unit: "kg",
        provider: "MANUAL",
      })
      .returning();
    assetId = asset.id;
    await upsertTenantDailyBars(tenantA, [
      { assetId, day: "2026-11-01", close: 10, source: "MANUAL_IMPORT" },
    ]);
    await upsertTenantDailyBars(tenantB, [
      { assetId, day: "2026-11-01", close: 20, source: "MANUAL_IMPORT" },
    ]);
    await db.insert(marketPriceSeries).values({
      assetId,
      timestamp: new Date("2026-11-01T00:00:00Z"),
      close: "30.0000",
      source: "FEED",
    });

    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-11-01T23:59:59Z");
    expect((await getSeries(asset.symbol, from, to, tenantA))?.map((row) => row.close)).toEqual([
      30,
    ]);
    expect(
      (await getSeries(asset.symbol, from, to, tenantA, "manual"))?.map((row) => row.close)
    ).toEqual([10]);
    expect(
      (await getSeries(asset.symbol, from, to, tenantB, "manual"))?.map((row) => row.close)
    ).toEqual([20]);

    await db
      .update(marketAssets)
      .set({ name: "Renomeado", baseCurrency: "USD" })
      .where(eq(marketAssets.id, assetId));
    const [stored] = await db
      .select()
      .from(tenantMarketPriceSeries)
      .where(
        and(
          eq(tenantMarketPriceSeries.tenantId, tenantA),
          eq(tenantMarketPriceSeries.assetId, assetId)
        )
      );
    expect(stored.assetName).toBe("Histórico próprio");
    expect(stored.currency).toBe("BRL");
    expect(stored.unit).toBe("kg");
  });
});
