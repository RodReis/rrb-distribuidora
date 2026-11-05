import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries, tenantMarketPriceSeries } from "@/lib/db/schema";
import { pctChange } from "./indicators";

export interface Quote {
  symbol: string;
  name: string;
  market: string;
  unit: string;
  baseCurrency: string;
  last: number | null;
  asOf: string | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
}

export interface SeriesBar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

const DAY_MS = 86_400_000;

export async function getQuotes(tenantId?: string): Promise<Quote[]> {
  const assets = await db
    .select()
    .from(marketAssets)
    .where(eq(marketAssets.active, true))
    .orderBy(asc(marketAssets.createdAt));

  return Promise.all(
    assets.map(async (asset) => {
      const globalRows = await db
        .select({ timestamp: marketPriceSeries.timestamp, close: marketPriceSeries.close })
        .from(marketPriceSeries)
        .where(
          and(
            eq(marketPriceSeries.assetId, asset.id),
            ne(marketPriceSeries.source, "MANUAL_IMPORT"),
            gte(marketPriceSeries.timestamp, new Date(Date.now() - 45 * DAY_MS))
          )
        )
        .orderBy(desc(marketPriceSeries.timestamp));

      const tenantRows = tenantId
        ? await db
            .select({
              timestamp: tenantMarketPriceSeries.timestamp,
              close: tenantMarketPriceSeries.close,
            })
            .from(tenantMarketPriceSeries)
            .where(
              and(
                eq(tenantMarketPriceSeries.tenantId, tenantId),
                eq(tenantMarketPriceSeries.assetId, asset.id),
                gte(tenantMarketPriceSeries.timestamp, new Date(Date.now() - 45 * DAY_MS))
              )
            )
            .orderBy(desc(tenantMarketPriceSeries.timestamp))
        : [];
      const rows = tenantRows.length > 0 ? tenantRows : globalRows;

      const last = rows[0];
      const closeAtOrBefore = (days: number) => {
        if (!last) return null;
        const target = last.timestamp.getTime() - days * DAY_MS;
        const found = rows.find((r) => r.timestamp.getTime() <= target);
        return found ? Number(found.close) : null;
      };
      const change = (days: number) => {
        const prev = days === 1 ? (rows[1] ? Number(rows[1].close) : null) : closeAtOrBefore(days);
        return last && prev != null ? pctChange(Number(last.close), prev) : null;
      };

      return {
        symbol: asset.symbol,
        name: asset.name,
        market: asset.market,
        unit: asset.unit,
        baseCurrency: asset.baseCurrency,
        last: last ? Number(last.close) : null,
        asOf: last ? last.timestamp.toISOString() : null,
        change24h: change(1),
        change7d: change(7),
        change30d: change(30),
      };
    })
  );
}

export async function getSeries(
  symbol: string,
  from: Date,
  to: Date,
  tenantId: string
): Promise<SeriesBar[] | null> {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  if (!asset) return null;

  const rows = await db
    .select()
    .from(marketPriceSeries)
    .where(
      and(
        eq(marketPriceSeries.assetId, asset.id),
        gte(marketPriceSeries.timestamp, from),
        lte(marketPriceSeries.timestamp, to),
        ne(marketPriceSeries.source, "MANUAL_IMPORT")
      )
    )
    .orderBy(asc(marketPriceSeries.timestamp));

  const tenantRows = await db
    .select()
    .from(tenantMarketPriceSeries)
    .where(
      and(
        eq(tenantMarketPriceSeries.tenantId, tenantId),
        eq(tenantMarketPriceSeries.assetId, asset.id),
        gte(tenantMarketPriceSeries.timestamp, from),
        lte(tenantMarketPriceSeries.timestamp, to)
      )
    )
    .orderBy(asc(tenantMarketPriceSeries.timestamp));

  const byTimestamp = new Map<number, (typeof rows)[number]>();
  for (const row of rows) byTimestamp.set(row.timestamp.getTime(), row);
  for (const row of tenantRows) byTimestamp.set(row.timestamp.getTime(), row);
  const combined = [...byTimestamp.values()].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  return combined.map((r) => {
    const close = Number(r.close);
    return {
      time: Math.floor(r.timestamp.getTime() / 1000),
      open: r.open != null ? Number(r.open) : close,
      high: r.high != null ? Number(r.high) : close,
      low: r.low != null ? Number(r.low) : close,
      close,
      volume: r.volume != null ? Number(r.volume) : null,
    };
  });
}

export function aggregateBars(bars: SeriesBar[], resolution: "1w" | "1m"): SeriesBar[] {
  const keyOf = (time: number) => {
    const d = new Date(time * 1000);
    if (resolution === "1m") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  };

  const out: SeriesBar[] = [];
  let currentKey = "";
  for (const bar of bars) {
    const key = keyOf(bar.time);
    const last = out[out.length - 1];
    if (key !== currentKey || !last) {
      out.push({ ...bar });
      currentKey = key;
    } else {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      last.volume =
        last.volume == null && bar.volume == null ? null : (last.volume ?? 0) + (bar.volume ?? 0);
    }
  }
  return out;
}

export async function getLastClose(symbol: string): Promise<number | null> {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  if (!asset) return null;
  const [row] = await db
    .select({ close: marketPriceSeries.close })
    .from(marketPriceSeries)
    .where(
      and(eq(marketPriceSeries.assetId, asset.id), ne(marketPriceSeries.source, "MANUAL_IMPORT"))
    )
    .orderBy(desc(marketPriceSeries.timestamp))
    .limit(1);
  return row ? Number(row.close) : null;
}
