import Papa from "papaparse";
import { ensureAssets } from "./assets";
import { upsertDailyBars, upsertTenantDailyBars, type DailyBar } from "./series-store";

/** CSV esperado: symbol,date,open,high,low,close,volume (date em YYYY-MM-DD). */
export async function importSeriesCsv(
  csv: string,
  tenantId?: string,
  forceSymbol?: string
): Promise<{ imported: number; skipped: number }> {
  const assets = await ensureAssets();
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const bars: DailyBar[] = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const assetId = assets[forceSymbol ?? (row.symbol ?? "").trim()];
    const close = Number((row.close ?? "").replace(",", "."));
    if (!assetId || !/^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "") || !Number.isFinite(close)) {
      skipped++;
      continue;
    }
    const num = (v?: string) => {
      const n = Number((v ?? "").replace(",", "."));
      return v && Number.isFinite(n) ? n : null;
    };
    bars.push({
      assetId,
      day: row.date,
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close,
      volume: num(row.volume),
      source: tenantId ? "MANUAL_IMPORT" : "SEED_IMPORT",
    });
  }
  if (tenantId) await upsertTenantDailyBars(tenantId, bars);
  else await upsertDailyBars(bars);
  return { imported: bars.length, skipped };
}
