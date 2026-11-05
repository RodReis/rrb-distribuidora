import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analysisRuns, auditLog, marketAssets, tenantMarketPriceSeries } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import {
  correlation,
  seasonality,
  shiftedBusinessDate,
  snapshotHash,
  type AnalysisPoint,
} from "@/lib/market/analysis";
import { MARKET_EXPORT_LIMIT, parseUtcInstant } from "@/lib/market/export";

async function ownedSeries(tenantId: string, symbol: string, from: Date, to: Date) {
  const [asset] = await db
    .select({ id: marketAssets.id, symbol: marketAssets.symbol, name: marketAssets.name })
    .from(marketAssets)
    .where(and(eq(marketAssets.symbol, symbol), eq(marketAssets.active, true)))
    .limit(1);
  if (!asset) return null;
  const rows = await db
    .select({
      timestamp: tenantMarketPriceSeries.timestamp,
      close: tenantMarketPriceSeries.close,
      source: tenantMarketPriceSeries.source,
      currency: tenantMarketPriceSeries.currency,
      unit: tenantMarketPriceSeries.unit,
    })
    .from(tenantMarketPriceSeries)
    .where(
      and(
        eq(tenantMarketPriceSeries.tenantId, tenantId),
        eq(tenantMarketPriceSeries.assetId, asset.id),
        gte(tenantMarketPriceSeries.timestamp, from),
        lte(tenantMarketPriceSeries.timestamp, to)
      )
    )
    .orderBy(asc(tenantMarketPriceSeries.timestamp))
    .limit(MARKET_EXPORT_LIMIT + 1);
  if (rows.length === 0) return null;
  return {
    asset,
    rows,
    points: rows.map((row): AnalysisPoint => ({
      day: row.timestamp.toISOString().slice(0, 10),
      close: Number(row.close),
    })),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const { type } = await params;
  if (!["sazonalidade", "correlacao", "spread"].includes(type))
    return NextResponse.json({ error: "Análise não encontrada." }, { status: 404 });
  if (type === "spread")
    return NextResponse.json(
      { error: "Não comparável: fórmula e componentes do custo landed pendentes de aprovação." },
      { status: 422 }
    );
  const query = new URL(request.url).searchParams;
  const symbol = query.get("symbol") ?? "";
  const second = query.get("second") ?? "";
  const from = parseUtcInstant(query.get("from"));
  const to = parseUtcInstant(query.get("to"));
  const lag = Number(query.get("lag") ?? "0");
  if (
    !symbol ||
    !from ||
    !to ||
    from > to ||
    (type === "correlacao" && (!second || ![0, 1, 5, 20].includes(lag)))
  ) {
    return NextResponse.json(
      { error: "Informe ativos, intervalo UTC e defasagem válidos." },
      { status: 400 }
    );
  }
  if (query.get("source") && query.get("source") !== "manual") {
    await db.insert(auditLog).values({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      entity: "market_analysis_denied",
      entityId: symbol,
      action: "insert",
      after: { reason: "source_not_licensed", type },
    });
    return NextResponse.json(
      { error: "Fonte sem licença de análise para este tenant." },
      { status: 403 }
    );
  }
  const left = await ownedSeries(guard.user.tenantId, symbol, from, to);
  const rightTo = type === "correlacao" ? shiftedBusinessDate(to, lag) : to;
  const right =
    type === "correlacao" ? await ownedSeries(guard.user.tenantId, second, from, rightTo) : null;
  if (!left || (type === "correlacao" && !right)) {
    await db.insert(auditLog).values({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      entity: "market_analysis_denied",
      entityId: symbol,
      action: "insert",
      after: { reason: "series_not_owned_or_missing", type },
    });
    return NextResponse.json({ error: "Série própria indisponível no período." }, { status: 404 });
  }
  if (left.rows.length > MARKET_EXPORT_LIMIT || (right && right.rows.length > MARKET_EXPORT_LIMIT))
    return NextResponse.json(
      { error: "Limite de pontos excedido. Reduza o intervalo." },
      { status: 413 }
    );
  if (
    [left, right].some(
      (series) =>
        series &&
        series.rows.some(
          (row) =>
            row.currency !== series.rows[0].currency ||
            row.unit !== series.rows[0].unit ||
            row.source !== "MANUAL_IMPORT"
        )
    )
  )
    return NextResponse.json(
      { error: "Série contém moeda, unidade ou fonte incompatível." },
      { status: 422 }
    );
  const result =
    type === "sazonalidade"
      ? seasonality(left.points, 3)
      : correlation(left.points, right!.points, lag);
  const input = {
    left: left.rows,
    right: right?.rows ?? null,
    parameters: { type, symbol, second, from: from.toISOString(), to: to.toISOString(), lag },
  };
  const hash = snapshotHash(input);
  const coverage = {
    left: left.points.length,
    right: right?.points.length ?? null,
    from: from.toISOString(),
    to: to.toISOString(),
    timezone: "UTC",
    frequency: "1d",
  };
  await db.insert(analysisRuns).values({
    tenantId: guard.user.tenantId,
    analysisType: type,
    inputSeries: right ? [symbol, second] : [symbol],
    parameters: input.parameters,
    methodVersion: result.methodVersion,
    coverage,
    result,
    sourceSnapshotHash: hash,
  });
  return NextResponse.json(
    {
      result,
      coverage,
      sourceSnapshotHash: hash,
      series: [left, right]
        .filter((s) => s !== null)
        .map((s, index) => ({
          symbol: s.asset.symbol,
          name: s.asset.name,
          source: "MANUAL_IMPORT",
          currency: s.rows[0].currency,
          unit: s.rows[0].unit,
          exportTo: (index === 0 ? to : rightTo).toISOString(),
        })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
