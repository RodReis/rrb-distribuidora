import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { NEWS_DISABLED_REASON } from "@/lib/market/news";

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.regulatory.read"))
    return NextResponse.json(
      { error: "Permissão market.regulatory.read necessária." },
      { status: 403 }
    );
  return NextResponse.json({ status: "indisponivel", items: [], reason: NEWS_DISABLED_REASON });
}

export async function POST() {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.regulatory.manage"))
    return NextResponse.json(
      { error: "Permissão market.regulatory.manage necessária." },
      { status: 403 }
    );
  return NextResponse.json({ error: NEWS_DISABLED_REASON }, { status: 503 });
}
