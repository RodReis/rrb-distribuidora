import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries } from "@/lib/db/schema";
import { ensureAssets } from "./assets";
import { fetchJsonWithRetry } from "./http";
import { upsertDailyBars, type DailyBar } from "./series-store";

const METALS_BASE = "https://metals-api.com/api";
const COMMODITY_BASE = "https://api.commoditypriceapi.com/v3";
const COMMODITY_BATCH = 5;

export type PriceProvider = "METALS_API" | "COMMODITY_PRICE_API";

interface LatestResponse {
  success: boolean;
  rates?: Record<string, number>;
  units?: Record<string, { market_price?: number }>;
  error?: { code: number; info: string };
}

interface CommodityResponse {
  success: boolean;
  rates?: Record<string, number>;
  metadata?: Record<string, { unit?: string; quote?: string }>;
  error?: { message?: string; info?: string } | string;
}

export interface MetalsIngestResult {
  source: PriceProvider | "DEV_FIXTURE" | "NONE";
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

/** Aceita só cotação em US$ por tonelada métrica (unidade usada pelo simulador). */
export function extractCommodityUsdPerTon(symbol: string, data: CommodityResponse): number {
  const price = data.rates?.[symbol];
  if (price == null || !(price > 0)) throw new Error(`sem cotação para o símbolo ${symbol}`);
  const meta = data.metadata?.[symbol];
  if (meta?.quote && meta.quote.toUpperCase() !== "USD") {
    throw new Error(`${symbol} é cotado em ${meta.quote}; só US$ é aceito.`);
  }
  if (meta?.unit && !/^(t|mt|metric ton|ton)$/i.test(meta.unit.replace(/[()\s]/g, " ").trim())) {
    throw new Error(`${symbol} é cotado por "${meta.unit}"; só tonelada métrica é aceita.`);
  }
  return price;
}

export const isMetalsApiConfigured = () => !!process.env.METALS_API_KEY;
export const isCommodityPriceApiConfigured = () => !!process.env.COMMODITY_PRICE_API_KEY;

async function fetchMetalsApiPrice(providerSymbol: string): Promise<number> {
  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) throw new Error("METALS_API_KEY não configurada no ambiente.");
  const url = `${METALS_BASE}/latest?access_key=${encodeURIComponent(apiKey)}&base=USD&symbols=${encodeURIComponent(providerSymbol)}`;
  const data = await fetchJsonWithRetry<LatestResponse>(url);
  if (!data.success) throw new Error(data.error?.info ?? "resposta sem sucesso");
  const price = extractUsdPerTon(providerSymbol, data);
  if (price == null) throw new Error(`sem cotação para o símbolo ${providerSymbol}`);
  return price;
}

async function fetchCommodityPrices(symbols: string[]): Promise<CommodityResponse> {
  const apiKey = process.env.COMMODITY_PRICE_API_KEY;
  if (!apiKey) throw new Error("COMMODITY_PRICE_API_KEY não configurada no ambiente.");
  const url = `${COMMODITY_BASE}/rates/latest?symbols=${encodeURIComponent(symbols.join(","))}`;
  const data = await fetchJsonWithRetry<CommodityResponse>(url, {
    headers: { "x-api-key": apiKey },
  });
  if (!data.success) {
    const err = data.error;
    throw new Error(
      typeof err === "string" ? err : (err?.message ?? err?.info ?? "resposta sem sucesso")
    );
  }
  return data;
}

export async function fetchProviderPrice(
  provider: PriceProvider,
  providerSymbol: string
): Promise<number> {
  if (provider === "METALS_API") return fetchMetalsApiPrice(providerSymbol);
  return extractCommodityUsdPerTon(providerSymbol, await fetchCommodityPrices([providerSymbol]));
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
        inArray(marketAssets.provider, ["METALS_API", "COMMODITY_PRICE_API"]),
        isNotNull(marketAssets.providerSymbol)
      )
    );
}

type AutomatedAsset = Awaited<ReturnType<typeof automatedAssets>>[number];

async function collectMetalsApi(assets: AutomatedAsset[], bars: DailyBar[], errors: string[]) {
  for (const asset of assets) {
    try {
      const price = await fetchMetalsApiPrice(asset.providerSymbol!);
      bars.push({ assetId: asset.id, day: todayDay(), close: price, source: "METALS_API" });
    } catch (err) {
      errors.push(`${asset.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function collectCommodityApi(assets: AutomatedAsset[], bars: DailyBar[], errors: string[]) {
  for (let i = 0; i < assets.length; i += COMMODITY_BATCH) {
    const chunk = assets.slice(i, i + COMMODITY_BATCH);
    let data: CommodityResponse;
    try {
      data = await fetchCommodityPrices(chunk.map((a) => a.providerSymbol!));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const a of chunk) errors.push(`${a.symbol}: ${message}`);
      continue;
    }
    for (const asset of chunk) {
      try {
        const price = extractCommodityUsdPerTon(asset.providerSymbol!, data);
        bars.push({
          assetId: asset.id,
          day: todayDay(),
          close: price,
          source: "COMMODITY_PRICE_API",
        });
      } catch (err) {
        errors.push(`${asset.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

async function ingestFixtureTick(assets: AutomatedAsset[]): Promise<MetalsIngestResult> {
  const bars: DailyBar[] = [];
  for (const asset of assets) {
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
  const assets = await automatedAssets();
  const metalsKey = isMetalsApiConfigured();
  const commodityKey = isCommodityPriceApiConfigured();

  if (!metalsKey && !commodityKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        source: "NONE",
        upserted: 0,
        errors: [
          "Nenhuma chave de provedor configurada (METALS_API_KEY ou COMMODITY_PRICE_API_KEY).",
        ],
      };
    }
    return ingestFixtureTick(assets);
  }

  const bars: DailyBar[] = [];
  const errors: string[] = [];
  const byProvider = (p: PriceProvider) => assets.filter((a) => a.provider === p);

  const metalsAssets = byProvider("METALS_API");
  if (metalsKey) await collectMetalsApi(metalsAssets, bars, errors);
  else for (const a of metalsAssets) errors.push(`${a.symbol}: METALS_API_KEY não configurada.`);

  const commodityAssets = byProvider("COMMODITY_PRICE_API");
  if (commodityKey) await collectCommodityApi(commodityAssets, bars, errors);
  else
    for (const a of commodityAssets)
      errors.push(`${a.symbol}: COMMODITY_PRICE_API_KEY não configurada.`);

  return {
    source:
      commodityAssets.length > 0 && metalsAssets.length === 0
        ? "COMMODITY_PRICE_API"
        : "METALS_API",
    upserted: await upsertDailyBars(bars),
    errors,
  };
}
