import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { products, purchaseOrderItems, purchaseOrders, purchaseReceipts } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";
import { calculatePaidAverages } from "@/lib/market/paid-price";

const querySchema = z.object({
  productId: z.string().uuid(),
  from: z.iso.date(),
  to: z.iso.date(),
});

export async function GET(request: Request) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  if (parsed.data.from > parsed.data.to)
    return NextResponse.json({ error: "Intervalo inválido." }, { status: 400 });

  const tenantId = guard.user.tenantId;
  const [product] = await db
    .select({ id: products.id, unit: products.unit })
    .from(products)
    .where(and(eq(products.id, parsed.data.productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!product) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });

  const rows = await db
    .select({
      id: purchaseReceipts.id,
      observedAt: purchaseReceipts.receivedAt,
      quantity: purchaseReceipts.quantity,
      unit: purchaseReceipts.unit,
      unitPrice: purchaseReceipts.unitCost,
      receivedBy: purchaseReceipts.receivedBy,
    })
    .from(purchaseReceipts)
    .innerJoin(
      purchaseOrderItems,
      and(
        eq(purchaseReceipts.purchaseOrderItemId, purchaseOrderItems.id),
        eq(purchaseOrderItems.tenantId, tenantId)
      )
    )
    .innerJoin(
      purchaseOrders,
      and(
        eq(purchaseReceipts.purchaseOrderId, purchaseOrders.id),
        eq(purchaseOrders.tenantId, tenantId)
      )
    )
    .where(
      and(
        eq(purchaseReceipts.tenantId, tenantId),
        eq(purchaseOrderItems.productId, product.id),
        isNull(purchaseReceipts.reversedAt),
        gte(purchaseReceipts.receivedAt, new Date(`${parsed.data.from}T00:00:00.000Z`)),
        lte(purchaseReceipts.receivedAt, new Date(`${parsed.data.to}T23:59:59.999Z`))
      )
    )
    .orderBy(asc(purchaseReceipts.receivedAt))
    .limit(5_001);
  if (rows.length > 5_000) {
    return NextResponse.json(
      { error: "Mais de 5.000 recebimentos. Reduza o período." },
      { status: 413 }
    );
  }

  const observations = rows.map((row) => ({
    id: row.id,
    observedAt: row.observedAt.toISOString(),
    quantity: Number(row.quantity),
    value: Number(row.unitPrice),
    currency: "BRL",
    unit: row.unit,
    provenanceType: "purchase_receipt" as const,
    purchaseReceiptId: row.id,
    manualUserId: null,
    methodVersion: "receipt-unit-cost-v1",
  }));
  const averages = calculatePaidAverages(observations);
  return NextResponse.json({
    productId: product.id,
    from: parsed.data.from,
    to: parsed.data.to,
    observations,
    averages,
  });
}
