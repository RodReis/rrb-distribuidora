import { NextResponse } from "next/server";
import { guardCron } from "@/lib/market/api-auth";
import { expireOverdueQuotes } from "@/lib/quotes/service";

export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const result = await expireOverdueQuotes();
    console.log("[job:expire-quotes]", JSON.stringify({ ...result, ms: Date.now() - startedAt }));
    const ok = result.errors.length === 0;
    return NextResponse.json(
      { ok, ...result, ms: Date.now() - startedAt },
      { status: ok ? 200 : 500 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[job:expire-quotes] falha:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
