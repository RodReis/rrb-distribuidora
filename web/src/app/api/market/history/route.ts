import { and, count, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marketAssets, tenantMarketPriceSeries } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import { MARKET_EXPORT_LIMIT, parseUtcInstant } from "@/lib/market/export";

export async function GET(request: Request) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "";
  const from = parseUtcInstant(params.get("from"));
  const to = parseUtcInstant(params.get("to"));
  if (!from || !to || from > to) {
    return NextResponse.json({ error: "Intervalo inválido." }, { status: 400 });
  }
  const [asset] = await db
    .select({ id: marketAssets.id })
    .from(marketAssets)
    .where(and(eq(marketAssets.symbol, symbol), eq(marketAssets.active, true)))
    .limit(1);
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });
  const [result] = await db
    .select({ count: count() })
    .from(tenantMarketPriceSeries)
    .where(
      and(
        eq(tenantMarketPriceSeries.tenantId, guard.user.tenantId),
        eq(tenantMarketPriceSeries.assetId, asset.id),
        gte(tenantMarketPriceSeries.timestamp, from),
        lte(tenantMarketPriceSeries.timestamp, to)
      )
    );
  return NextResponse.json({
    symbol,
    from: from.toISOString(),
    to: to.toISOString(),
    count: result.count,
    exportLimit: MARKET_EXPORT_LIMIT,
    source: "MANUAL_IMPORT",
  });
}
