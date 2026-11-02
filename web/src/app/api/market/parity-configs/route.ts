import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, importParityConfigs } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import { parityConfigSchema } from "@/lib/market/parity-schema";

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const configs = await db
    .select()
    .from(importParityConfigs)
    .where(eq(importParityConfigs.tenantId, guard.user.tenantId))
    .orderBy(desc(importParityConfigs.updatedAt));
  return NextResponse.json({ configs });
}

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  const { user } = guard;

  const parsed = parityConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }
  const { id, ...v } = parsed.data;
  const values = {
    name: v.name,
    associatedProductId: v.associatedProductId ?? null,
    iiTaxPct: v.iiTaxPct.toFixed(2),
    ipiTaxPct: v.ipiTaxPct.toFixed(2),
    pisTaxPct: v.pisTaxPct.toFixed(2),
    cofinsTaxPct: v.cofinsTaxPct.toFixed(2),
    icmsTaxPct: v.icmsTaxPct.toFixed(2),
    portExpensesPerTon: v.portExpensesPerTon.toFixed(2),
    roadFreightPerTon: v.roadFreightPerTon.toFixed(2),
    oceanFreightUsdPerTon: v.oceanFreightUsdPerTon.toFixed(2),
    domesticPriceBrlPerTon: v.domesticPriceBrlPerTon.toFixed(2),
    updatedBy: user.id,
    updatedAt: new Date(),
  };

  if (id) {
    const [before] = await db
      .select()
      .from(importParityConfigs)
      .where(and(eq(importParityConfigs.id, id), eq(importParityConfigs.tenantId, user.tenantId)));
    if (!before)
      return NextResponse.json({ error: "Configuração não encontrada." }, { status: 404 });
    const [updated] = await db
      .update(importParityConfigs)
      .set(values)
      .where(eq(importParityConfigs.id, id))
      .returning();
    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "import_parity_configs",
      entityId: updated.id,
      action: "update",
      before,
      after: updated,
    });
    return NextResponse.json({ config: updated });
  }

  const [created] = await db
    .insert(importParityConfigs)
    .values({ ...values, tenantId: user.tenantId })
    .returning();
  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "import_parity_configs",
    entityId: created.id,
    action: "insert",
    before: null,
    after: created,
  });
  return NextResponse.json({ config: created }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  const { user } = guard;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o id." }, { status: 400 });

  const [before] = await db
    .select()
    .from(importParityConfigs)
    .where(and(eq(importParityConfigs.id, id), eq(importParityConfigs.tenantId, user.tenantId)));
  if (!before) return NextResponse.json({ error: "Configuração não encontrada." }, { status: 404 });

  await db.delete(importParityConfigs).where(eq(importParityConfigs.id, id));
  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "import_parity_configs",
    entityId: id,
    action: "delete",
    before,
    after: null,
  });
  return NextResponse.json({ ok: true });
}
