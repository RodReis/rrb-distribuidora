import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketPriceSeries } from "@/lib/db/schema";

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
