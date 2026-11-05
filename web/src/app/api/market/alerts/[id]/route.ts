import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, marketAlertRules } from "@/lib/db/schema";
import { guardMarketAlertConfigure } from "@/lib/market/api-auth";

const patchSchema = z.object({ active: z.boolean() });

async function loadRule(id: string, tenantId: string) {
  const [rule] = await db
    .select()
    .from(marketAlertRules)
    .where(and(eq(marketAlertRules.id, id), eq(marketAlertRules.tenantId, tenantId)));
  return rule ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardMarketAlertConfigure();
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const before = await loadRule(id, guard.user.tenantId);
  if (!before) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });

  const [updated] = await db
    .update(marketAlertRules)
    .set({ active: parsed.data.active })
    .where(eq(marketAlertRules.id, id))
    .returning();
  await db.insert(auditLog).values({
    tenantId: guard.user.tenantId,
    userId: guard.user.id,
    entity: "market_alert_rules",
    entityId: id,
    action: "update",
    before,
    after: updated,
  });
  return NextResponse.json({ rule: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardMarketAlertConfigure();
  if (guard.error) return guard.error;
  const { id } = await params;

  const before = await loadRule(id, guard.user.tenantId);
  if (!before) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });

  await db.delete(marketAlertRules).where(eq(marketAlertRules.id, id));
  await db.insert(auditLog).values({
    tenantId: guard.user.tenantId,
    userId: guard.user.id,
    entity: "market_alert_rules",
    entityId: id,
    action: "delete",
    before,
    after: null,
  });
  return NextResponse.json({ ok: true });
}
