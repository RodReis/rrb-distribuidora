import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, stockPredictiveMetrics, suppliers, stockLots } from "@/lib/db/schema";
import { guardStock } from "@/lib/stock/api-auth";
import { and, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const guard = await guardStock("read");
    if (guard.error) return guard.error;
    const user = guard.user;
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status"); // 'CRITICAL_RUPTURE', 'WARNING', etc.
    const familyFilter = searchParams.get("family");

    const conditions = [eq(products.tenantId, user.tenantId), eq(products.status, "ativo")];
    if (familyFilter && familyFilter !== "todas") {
      conditions.push(eq(products.family, familyFilter as any));
    }

    const items = await db
      .select({
        productId: products.id,
        sku: products.sku,
        erpCode: products.erpCode,
        commercialDescription: products.commercialDescription,
        norm: products.norm,
        family: products.family,
        unit: products.unit,
        thicknessMm: products.thicknessMm,
        currentStockQty: stockPredictiveMetrics.currentStockQty,
        avgDailyConsumption30d: stockPredictiveMetrics.avgDailyConsumption30d,
        leadTimeDays: stockPredictiveMetrics.leadTimeDays,
        coverageDays: stockPredictiveMetrics.coverageDays,
        safetyStockQty: stockPredictiveMetrics.safetyStockQty,
        reorderPointQty: stockPredictiveMetrics.reorderPointQty,
        predictiveStatus: stockPredictiveMetrics.predictiveStatus,
        suggestedPurchaseQty: stockPredictiveMetrics.suggestedPurchaseQty,
        suggestedPurchaseDate: stockPredictiveMetrics.suggestedPurchaseDate,
        curveAbc: stockPredictiveMetrics.curveAbc,
        curveXyz: stockPredictiveMetrics.curveXyz,
      })
      .from(products)
      .innerJoin(stockPredictiveMetrics, eq(products.id, stockPredictiveMetrics.productId))
      .where(and(...conditions));

    const filtered =
      statusFilter && statusFilter !== "todos"
        ? items.filter((item) => item.predictiveStatus === statusFilter)
        : items;

    return NextResponse.json({ success: true, data: filtered });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
