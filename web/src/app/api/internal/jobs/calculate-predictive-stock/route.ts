import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { recalculatePredictiveMetricsForTenant } from "@/lib/stock/predictive-engine";
import { guardCron } from "@/lib/market/api-auth";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);

    let totalRecalculated = 0;
    for (const t of allTenants) {
      const results = await recalculatePredictiveMetricsForTenant(t.id);
      totalRecalculated += results.length;
    }

    console.log(
      "[job:calculate-predictive-stock]",
      JSON.stringify({
        totalRecalculated,
        tenantsCount: allTenants.length,
        ms: Date.now() - startedAt,
      })
    );

    return NextResponse.json({
      ok: true,
      totalRecalculated,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[job:calculate-predictive-stock] falha:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
