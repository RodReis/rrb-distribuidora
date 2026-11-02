import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketPriceSeries } from "@/lib/db/schema";
import { ASSET_SYMBOLS, ensureAssets } from "./assets";
import { fetchJsonWithRetry } from "./http";

const BCB_BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

interface BcbQuote {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
}

interface BcbResponse {
  value: BcbQuote[];
}

export interface PtaxIngestResult {
  fetched: number;
  upserted: number;
}

const bcbDate = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;

async function upsertQuotes(quotes: BcbQuote[]): Promise<number> {
  if (quotes.length === 0) return 0;
  const assets = await ensureAssets();
  const assetId = assets[ASSET_SYMBOLS.PTAX];

  const byDay = new Map<string, BcbQuote>();
  for (const q of quotes) {
    const day = q.dataHoraCotacao.slice(0, 10);
    const current = byDay.get(day);
    if (!current || q.dataHoraCotacao > current.dataHoraCotacao) byDay.set(day, q);
  }

  const values = [...byDay.entries()].map(([day, q]) => ({
    assetId,
    timestamp: new Date(`${day}T00:00:00.000Z`),
    close: q.cotacaoVenda.toFixed(4),
    open: q.cotacaoCompra.toFixed(4),
    high: null,
    low: null,
    source: "BCB_API",
  }));

  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(marketPriceSeries)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [marketPriceSeries.assetId, marketPriceSeries.timestamp],
        set: { close: sql`excluded.close`, open: sql`excluded.open`, source: sql`excluded.source` },
      });
  }
  return values.length;
}

export async function ingestPtaxDay(date: Date = new Date()): Promise<PtaxIngestResult> {
  const url = `${BCB_BASE}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${bcbDate(date)}'&$format=json`;
  const data = await fetchJsonWithRetry<BcbResponse>(url);
  return { fetched: data.value.length, upserted: await upsertQuotes(data.value) };
}

export async function ingestPtaxRange(from: Date, to: Date): Promise<PtaxIngestResult> {
  const url = `${BCB_BASE}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${bcbDate(from)}'&@dataFinalCotacao='${bcbDate(to)}'&$format=json&$top=10000`;
  const data = await fetchJsonWithRetry<BcbResponse>(url);
  return { fetched: data.value.length, upserted: await upsertQuotes(data.value) };
}

export async function backfillPtax(months = 24): Promise<PtaxIngestResult> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - months);
  return ingestPtaxRange(from, to);
}
