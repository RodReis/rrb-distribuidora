import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries, tenantMarketPriceSeries } from "@/lib/db/schema";

export interface DailyBar {
  assetId: string;
  day: string; // YYYY-MM-DD
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
  source: string;
}

const fmt = (n: number | null | undefined) => (n == null ? null : n.toFixed(4));

export async function upsertDailyBars(bars: DailyBar[]): Promise<number> {
  for (let i = 0; i < bars.length; i += 500) {
    const chunk = bars.slice(i, i + 500).map((b) => ({
      assetId: b.assetId,
      timestamp: new Date(`${b.day}T00:00:00.000Z`),
      open: fmt(b.open ?? b.close),
      high: fmt(b.high ?? b.close),
      low: fmt(b.low ?? b.close),
      close: b.close.toFixed(4),
      volume: b.volume == null ? null : b.volume.toFixed(2),
      source: b.source,
    }));
    // Coletas intradiárias consolidam o candle do dia: abertura preservada, máxima/mínima expandidas.
    await db
      .insert(marketPriceSeries)
      .values(chunk)
      .onConflictDoUpdate({
        target: [marketPriceSeries.assetId, marketPriceSeries.timestamp],
        set: {
          close: sql`excluded.close`,
          high: sql`GREATEST(${marketPriceSeries.high}, excluded.high)`,
          low: sql`LEAST(${marketPriceSeries.low}, excluded.low)`,
          volume: sql`COALESCE(excluded.volume, ${marketPriceSeries.volume})`,
          source: sql`excluded.source`,
        },
      });
  }
  return bars.length;
}

export async function upsertTenantDailyBars(tenantId: string, bars: DailyBar[]): Promise<number> {
  if (bars.length === 0) return 0;
  const assetIds = [...new Set(bars.map((bar) => bar.assetId))];
  const assets = await db
    .select({
      id: marketAssets.id,
      name: marketAssets.name,
      currency: marketAssets.baseCurrency,
      unit: marketAssets.unit,
    })
    .from(marketAssets)
    .where(inArray(marketAssets.id, assetIds));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (let i = 0; i < bars.length; i += 500) {
    const chunk = bars.slice(i, i + 500).map((bar) => {
      const asset = byId.get(bar.assetId);
      if (!asset) throw new Error("Ativo de mercado não encontrado.");
      return {
        tenantId,
        assetId: bar.assetId,
        assetName: asset.name,
        currency: asset.currency,
        unit: asset.unit,
        timestamp: new Date(`${bar.day}T00:00:00.000Z`),
        open: fmt(bar.open ?? bar.close),
        high: fmt(bar.high ?? bar.close),
        low: fmt(bar.low ?? bar.close),
        close: bar.close.toFixed(4),
        volume: bar.volume == null ? null : bar.volume.toFixed(2),
        source: "MANUAL_IMPORT",
      };
    });
    await db
      .insert(tenantMarketPriceSeries)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          tenantMarketPriceSeries.tenantId,
          tenantMarketPriceSeries.assetId,
          tenantMarketPriceSeries.timestamp,
        ],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
          source: sql`excluded.source`,
          assetName: sql`excluded.asset_name`,
          currency: sql`excluded.currency`,
          unit: sql`excluded.unit`,
        },
      });
  }
  return bars.length;
}
