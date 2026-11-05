import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signalModels, signalObservations } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import { SIGNAL_DISABLED_REASON } from "@/lib/market/signals";

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const [model] = await db
    .select({ id: signalModels.id, version: signalModels.version })
    .from(signalModels)
    .where(
      and(
        eq(signalModels.tenantId, guard.user.tenantId),
        isNotNull(signalModels.approvedBy),
        lte(signalModels.activeFrom, new Date())
      )
    )
    .orderBy(desc(signalModels.activeFrom))
    .limit(1);
  if (!model)
    return NextResponse.json({
      status: "indisponivel",
      score: null,
      reason: SIGNAL_DISABLED_REASON,
    });
  const observations = await db
    .select()
    .from(signalObservations)
    .where(
      and(
        eq(signalObservations.tenantId, guard.user.tenantId),
        eq(signalObservations.modelId, model.id)
      )
    )
    .orderBy(desc(signalObservations.asOf))
    .limit(100);
  if (observations.length === 0)
    return NextResponse.json({
      status: "indisponivel",
      score: null,
      model,
      reason: "Modelo aprovado sem observações calculadas.",
    });
  return NextResponse.json({ status: "disponivel", model, observations });
}
