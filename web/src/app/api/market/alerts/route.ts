import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, marketAlertRules, marketAssets } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import { CONDITION_TYPES } from "@/lib/market/conditions";

const createSchema = z.object({
  assetId: z.string().uuid("Selecione um ativo."),
  conditionType: z.enum(CONDITION_TYPES),
  thresholdValue: z.number().min(0, "O limite não pode ser negativo.").max(1_000_000),
  channels: z.array(z.enum(["in_app", "email"])).min(1, "Selecione ao menos um canal."),
});

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const rules = await db
    .select({
      id: marketAlertRules.id,
      assetId: marketAlertRules.assetId,
      assetName: marketAssets.name,
      assetSymbol: marketAssets.symbol,
      conditionType: marketAlertRules.conditionType,
      thresholdValue: marketAlertRules.thresholdValue,
      channels: marketAlertRules.channels,
      active: marketAlertRules.active,
      lastTriggeredAt: marketAlertRules.lastTriggeredAt,
      createdAt: marketAlertRules.createdAt,
    })
    .from(marketAlertRules)
    .innerJoin(marketAssets, eq(marketAssets.id, marketAlertRules.assetId))
    .where(eq(marketAlertRules.tenantId, guard.user.tenantId))
    .orderBy(desc(marketAlertRules.createdAt));
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  const { user } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const [asset] = await db
    .select()
    .from(marketAssets)
    .where(eq(marketAssets.id, parsed.data.assetId));
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });

  const [created] = await db
    .insert(marketAlertRules)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      assetId: parsed.data.assetId,
      conditionType: parsed.data.conditionType,
      thresholdValue: parsed.data.thresholdValue.toFixed(4),
      channels: parsed.data.channels,
    })
    .returning();
  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "market_alert_rules",
    entityId: created.id,
    action: "insert",
    before: null,
    after: created,
  });
  return NextResponse.json({ rule: created }, { status: 201 });
}
