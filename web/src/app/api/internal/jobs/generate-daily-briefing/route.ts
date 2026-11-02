import { NextResponse } from "next/server";
import { guardCron } from "@/lib/market/api-auth";
import { generateDailyBriefingAllTenants } from "@/lib/ai/briefing-generator";

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;
  const startedAt = Date.now();
  try {
    const { results, errors } = await generateDailyBriefingAllTenants();
    const ok = errors.length === 0;
    return NextResponse.json(
      { ok, count: results.length, errors, ms: Date.now() - startedAt },
      { status: ok ? 200 : 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
