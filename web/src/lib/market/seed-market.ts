import { readFileSync } from "node:fs";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketPriceSeries } from "@/lib/db/schema";
import { ASSET_SYMBOLS, ensureAssets } from "./assets";
import { generateFixtureBars } from "./fixtures";
import { importSeriesCsv } from "./import-csv";
import { backfillPtax } from "./ingest-ptax";
import { upsertDailyBars } from "./series-store";

async function main() {
  const assets = await ensureAssets();
  console.log(`Ativos de mercado: ${Object.keys(assets).join(", ")}`);

  try {
    const ptax = await backfillPtax(24);
    console.log(`PTAX (BCB): ${ptax.fetched} cotações, ${ptax.upserted} dias gravados.`);
  } catch (err) {
    console.error("Falha na carga histórica PTAX:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }

  const csvPath = process.env.METALS_CSV_PATH;
  if (csvPath) {
    const res = await importSeriesCsv(readFileSync(csvPath, "utf8"));
    console.log(`CSV de metais: ${res.imported} linhas importadas, ${res.skipped} ignoradas.`);
    return;
  }

  if (process.env.SEED_MODE === "production") {
    console.log("Produção sem METALS_CSV_PATH: histórico de metais não carregado.");
    return;
  }

  const today = new Date();
  for (const symbol of [ASSET_SYMBOLS.LME_ALU, ASSET_SYMBOLS.HRC_US, ASSET_SYMBOLS.HRC_CN]) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(marketPriceSeries)
      .where(eq(marketPriceSeries.assetId, assets[symbol]));
    if (n > 0) {
      console.log(`${symbol}: já possui ${n} pontos, fixture não aplicada.`);
      continue;
    }
    const bars = generateFixtureBars(symbol, today, 24).map((b) => ({
      ...b,
      assetId: assets[symbol],
      source: "DEV_FIXTURE",
    }));
    await upsertDailyBars(bars);
    console.log(`${symbol}: ${bars.length} pontos de fixture (DEV_FIXTURE) gravados.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
