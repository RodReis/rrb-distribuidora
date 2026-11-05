import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { getQuotes } from "@/lib/market/queries";

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  return NextResponse.json({ quotes: await getQuotes(guard.user.tenantId) });
}
