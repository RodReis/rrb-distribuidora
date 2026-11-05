import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { SIGNAL_DISABLED_REASON } from "@/lib/market/signals";

export async function POST() {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.backtest.execute"))
    return NextResponse.json({ error: "Permissão de backtest necessária." }, { status: 403 });
  return NextResponse.json(
    { status: "indisponivel", error: SIGNAL_DISABLED_REASON },
    { status: 409 }
  );
}
