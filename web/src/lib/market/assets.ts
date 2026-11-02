import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets } from "@/lib/db/schema";
import { ASSET_SYMBOLS } from "./asset-symbols";

export { ASSET_SYMBOLS };

export const ASSET_DEFS = [
  {
    symbol: ASSET_SYMBOLS.PTAX,
    name: "Dólar PTAX (BCB)",
    market: "BCB",
    baseCurrency: "BRL",
    unit: "ptax",
    provider: "BCB_PTAX",
  },
  {
    symbol: ASSET_SYMBOLS.LME_ALU,
    provider: "METALS_API",
    providerSymbol: "LME-ALU",
    name: "Alumínio LME",
    market: "LME",
    baseCurrency: "USD",
    unit: "ton",
  },
  {
    symbol: ASSET_SYMBOLS.HRC_US,
    provider: "METALS_API",
    providerSymbol: "STEEL-HRC",
    name: "Bobina a Quente HRC (US)",
    market: "CME",
    baseCurrency: "USD",
    unit: "ton",
  },
  {
    symbol: ASSET_SYMBOLS.HRC_CN,
    provider: "METALS_API",
    providerSymbol: "STEEL-HRC-CN",
    name: "Bobina a Quente HRC FOB China",
    market: "SHFE",
    baseCurrency: "USD",
    unit: "ton",
  },
] as const;

export async function ensureAssets(): Promise<Record<string, string>> {
  await db
    .insert(marketAssets)
    .values([...ASSET_DEFS])
    .onConflictDoNothing();
  const rows = await db.select().from(marketAssets);
  return Object.fromEntries(rows.map((r) => [r.symbol, r.id]));
}

export async function getAssetBySymbol(symbol: string) {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  return asset ?? null;
}
