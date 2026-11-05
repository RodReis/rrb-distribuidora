import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { NEWS_DISABLED_REASON } from "@/lib/market/news";

export async function POST() {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.news.review"))
    return NextResponse.json(
      { error: "Permissão market.news.review necessária." },
      { status: 403 }
    );
  return NextResponse.json({ error: NEWS_DISABLED_REASON }, { status: 503 });
}
