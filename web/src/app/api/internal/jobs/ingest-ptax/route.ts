import { NextResponse } from "next/server";
import { guardCron } from "@/lib/market/api-auth";
import { evaluateAlerts } from "@/lib/market/alerts";
import { ingestPtaxDay } from "@/lib/market/ingest-ptax";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const ingest = await ingestPtaxDay();
    const alerts = await evaluateAlerts();
    console.log(
      "[job:ingest-ptax]",
      JSON.stringify({ ingest, alerts, ms: Date.now() - startedAt })
    );
    return NextResponse.json({ ok: true, ingest, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[job:ingest-ptax] falha", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
