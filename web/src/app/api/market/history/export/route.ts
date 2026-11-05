import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marketAssets, marketExports, tenantMarketPriceSeries } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import {
  MARKET_EXPORT_LIMIT,
  parseUtcInstant,
  toMarketCsv,
  toMarketXlsx,
  type ExportPoint,
} from "@/lib/market/export";

export async function GET(request: Request) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;

  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol");
  const format = params.get("format");
  const to = parseUtcInstant(params.get("to"));
  const from = parseUtcInstant(params.get("from"));
  if (!symbol || !["csv", "xlsx"].includes(format ?? "") || !from || !to || from > to) {
    return NextResponse.json(
      { error: "Informe ativo, formato e intervalo UTC válido." },
      { status: 400 }
    );
  }

  const [asset] = await db
    .select()
    .from(marketAssets)
    .where(and(eq(marketAssets.symbol, symbol), eq(marketAssets.active, true)))
    .limit(1);
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });
  // Apenas pontos importados pelo tenant. Séries globais de provedores externos requerem licença.
  const rows = await db
    .select()
    .from(tenantMarketPriceSeries)
    .where(
      and(
        eq(tenantMarketPriceSeries.tenantId, guard.user.tenantId),
        eq(tenantMarketPriceSeries.assetId, asset.id),
        gte(tenantMarketPriceSeries.timestamp, from),
        lte(tenantMarketPriceSeries.timestamp, to)
      )
    )
    .orderBy(asc(tenantMarketPriceSeries.timestamp))
    .limit(MARKET_EXPORT_LIMIT + 1);
  if (rows.length > MARKET_EXPORT_LIMIT) {
    return NextResponse.json(
      {
        error: `Limite de ${MARKET_EXPORT_LIMIT} pontos excedido. Reduza o intervalo.`,
        limit: MARKET_EXPORT_LIMIT,
      },
      { status: 413 }
    );
  }

  const points: ExportPoint[] = rows.map((row) => ({
    symbol: asset.symbol,
    asset: row.assetName,
    source: row.source,
    timestamp: row.timestamp,
    currency: row.currency,
    unit: row.unit,
    frequency: "1d",
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    corrected: null,
    missing: null,
  }));

  const file = format === "xlsx" ? toMarketXlsx(points) : toMarketCsv(points);
  const exportId = randomUUID();
  const safeSymbol = asset.symbol.replace(/[^A-Za-z0-9_-]/g, "_");
  await db.insert(marketExports).values({
    id: exportId,
    tenantId: guard.user.tenantId,
    userId: guard.user.id,
    filters: { symbol, from: from.toISOString(), to: to.toISOString() },
    format: format!,
    rowCount: rows.length,
    status: "completed",
  });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mercado-${safeSymbol}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.${format}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "private, no-store",
      "X-Export-Rows": String(rows.length),
    },
  });
}
