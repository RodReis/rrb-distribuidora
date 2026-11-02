import { NextResponse } from "next/server";
import { guardCron } from "@/lib/market/api-auth";
import { generateDailyBriefingAllTenants } from "@/lib/ai/briefing-generator";

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;
  const startedAt = Date.now();
  try {
    const results = await generateDailyBriefingAllTenants();
    return NextResponse.json({ ok: true, count: results.length, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}