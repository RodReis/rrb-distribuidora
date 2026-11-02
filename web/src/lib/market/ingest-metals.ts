import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries } from "@/lib/db/schema";
import { ensureAssets } from "./assets";
import { fetchJsonWithRetry } from "./http";
import { upsertDailyBars, type DailyBar } from "./series-store";

const METALS_BASE = "https://metals-api.com/api";

interface LatestResponse {
  success: boolean;
  rates?: Record<string, number>;
  units?: Record<string, { market_price?: number }>;
  error?: { code: number; info: string };
}

export interface MetalsIngestResult {
  source: "METALS_API" | "DEV_FIXTURE";
  upserted: number;
  errors: string[];
}

/** USD por tonelada: usa market_price da API, depois USD<símbolo>, depois 1/rate. */
export function extractUsdPerTon(symbol: string, data: LatestResponse): number | null {
  const marketPrice = data.units?.[symbol]?.market_price;
  if (marketPrice && marketPrice > 0) return marketPrice;
  const direct = data.rates?.[`USD${symbol}`];
  if (direct && direct > 0) return direct;
  const inverse = data.rates?.[symbol];
  if (inverse && inverse > 0) return 1 / inverse;
  return null;
}

export function isMetalsApiConfigured(): boolean {
  return !!process.env.METALS_API_KEY;
}

export async function fetchMetalsApiPrice(providerSymbol: string): Promise<number> {
  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) throw new Error("METALS_API_KEY não configurada no ambiente.");
  const url = `${METALS_BASE}/latest?access_key=${encodeURIComponent(apiKey)}&base=USD&symbols=${encodeURIComponent(providerSymbol)}`;
  const data = await fetchJsonWithRetry<LatestResponse>(url);
  if (!data.success) throw new Error(data.error?.info ?? "resposta sem sucesso");
  const price = extractUsdPerTon(providerSymbol, data);
  if (price == null) throw new Error(`sem cotação para o símbolo ${providerSymbol}`);
  return price;
}

const todayDay = () => new Date().toISOString().slice(0, 10);

async function automatedAssets() {
  await ensureAssets();
  return db
    .select()
    .from(marketAssets)
    .where(
      and(
        eq(marketAssets.active, true),
        eq(marketAssets.provider, "METALS_API"),
        isNotNull(marketAssets.providerSymbol)
      )
    );
}

async function ingestFromApi(): Promise<MetalsIngestResult> {
  const errors: string[] = [];
  const bars: DailyBar[] = [];

  for (const asset of await automatedAssets()) {
    try {
      const price = await fetchMetalsApiPrice(asset.providerSymbol!);
      bars.push({ assetId: asset.id, day: todayDay(), close: price, source: "METALS_API" });
    } catch (err) {
      errors.push(`${asset.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { source: "METALS_API", upserted: await upsertDailyBars(bars), errors };
}

async function ingestFixtureTick(): Promise<MetalsIngestResult> {
  const bars: DailyBar[] = [];
  for (const asset of await automatedAssets()) {
    const [last] = await db
      .select({ close: marketPriceSeries.close })
      .from(marketPriceSeries)
      .where(eq(marketPriceSeries.assetId, asset.id))
      .orderBy(desc(marketPriceSeries.timestamp))
      .limit(1);
    if (!last) continue;
    const price = Number(last.close) * (1 + (Math.random() - 0.5) * 0.004);
    bars.push({ assetId: asset.id, day: todayDay(), close: price, source: "DEV_FIXTURE" });
  }
  return { source: "DEV_FIXTURE", upserted: await upsertDailyBars(bars), errors: [] };
}

export async function ingestMetals(): Promise<MetalsIngestResult> {
  if (isMetalsApiConfigured()) return ingestFromApi();
  if (process.env.NODE_ENV === "production") {
    return { source: "METALS_API", upserted: 0, errors: ["METALS_API_KEY não configurada"] };
  }
  return ingestFixtureTick();
}
