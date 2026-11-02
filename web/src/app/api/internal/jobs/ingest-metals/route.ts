import { NextResponse } from "next/server";
import { guardCron } from "@/lib/market/api-auth";
import { evaluateAlerts } from "@/lib/market/alerts";
import { ingestMetals } from "@/lib/market/ingest-metals";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const ingest = await ingestMetals();
    const alerts = await evaluateAlerts();
    console.log(
      "[job:ingest-metals]",
      JSON.stringify({ ingest, alerts, ms: Date.now() - startedAt })
    );
    return NextResponse.json({ ok: ingest.errors.length === 0, ingest, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[job:ingest-metals] falha", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
