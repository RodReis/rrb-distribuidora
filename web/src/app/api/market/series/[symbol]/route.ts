import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { aggregateBars, getSeries } from "@/lib/market/queries";

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;

  const { symbol } = await params;
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : new Date(to.getTime() - 365 * 86_400_000);
  const resolution = url.searchParams.get("resolution") ?? "1d";

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Intervalo de datas inválido." }, { status: 400 });
  }
  if (!["1d", "1w", "1m"].includes(resolution)) {
    return NextResponse.json({ error: "Resolução inválida (use 1d, 1w ou 1m)." }, { status: 400 });
  }

  const bars = await getSeries(symbol, from, to);
  if (!bars) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });

  return NextResponse.json({
    symbol,
    resolution,
    bars: resolution === "1d" ? bars : aggregateBars(bars, resolution as "1w" | "1m"),
  });
}
