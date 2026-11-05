import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, marketAssets, marketManualPrices, users } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";

const manualSchema = z.object({
  symbol: z.string().min(1).max(30),
  value: z.number().positive().finite().max(1_000_000_000),
});

async function findAsset(symbol: string) {
  const [asset] = await db
    .select()
    .from(marketAssets)
    .where(and(eq(marketAssets.symbol, symbol), eq(marketAssets.active, true)))
    .limit(1);
  return asset;
}

export async function GET(request: Request) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  const asset = await findAsset(symbol);
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });

  const [row] = await db
    .select({
      id: marketManualPrices.id,
      value: marketManualPrices.value,
      currency: marketManualPrices.currency,
      unit: marketManualPrices.unit,
      observedAt: marketManualPrices.observedAt,
      userId: marketManualPrices.userId,
      author: users.name,
    })
    .from(marketManualPrices)
    .innerJoin(users, eq(users.id, marketManualPrices.userId))
    .where(
      and(
        eq(marketManualPrices.tenantId, guard.user.tenantId),
        eq(marketManualPrices.assetId, asset.id)
      )
    )
    .orderBy(desc(marketManualPrices.observedAt))
    .limit(1);
  return NextResponse.json({
    manual: row
      ? {
          ...row,
          value: Number(row.value),
          observedAt: row.observedAt.toISOString(),
          provenanceType: "manual",
        }
      : null,
  });
}

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  const parsed = manualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Valor manual inválido." }, { status: 400 });
  const asset = await findAsset(parsed.data.symbol);
  if (!asset) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });

  const [created] = await db
    .insert(marketManualPrices)
    .values({
      tenantId: guard.user.tenantId,
      assetId: asset.id,
      value: parsed.data.value.toFixed(4),
      currency: asset.baseCurrency,
      unit: asset.unit,
      userId: guard.user.id,
    })
    .returning();
  await db.insert(auditLog).values({
    tenantId: guard.user.tenantId,
    userId: guard.user.id,
    entity: "market_manual_prices",
    entityId: created.id,
    action: "insert",
    before: null,
    after: {
      symbol: asset.symbol,
      value: created.value,
      currency: created.currency,
      unit: created.unit,
      observedAt: created.observedAt.toISOString(),
    },
  });
  return NextResponse.json(
    {
      manual: {
        id: created.id,
        value: Number(created.value),
        currency: created.currency,
        unit: created.unit,
        observedAt: created.observedAt.toISOString(),
        userId: guard.user.id,
        author: guard.user.name,
        provenanceType: "manual",
      },
    },
    { status: 201 }
  );
}
