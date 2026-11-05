import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  products,
  stockPredictiveMetrics,
  suppliers,
  stockLots,
  stockReservations,
  warehouses,
} from "@/lib/db/schema";
import { guardStock } from "@/lib/stock/api-auth";
import { and, eq, sql } from "drizzle-orm";

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
        leadTimeSource: stockPredictiveMetrics.leadTimeSource,
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

    const depots = await db
      .select({ id: warehouses.id, name: warehouses.name })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, user.tenantId), eq(warehouses.active, true)))
      .orderBy(warehouses.name);
    const warehouseFilter = searchParams.get("warehouseId");
    if (warehouseFilter && !depots.some((warehouse) => warehouse.id === warehouseFilter)) {
      return NextResponse.json({ error: "Depósito inválido para este tenant." }, { status: 400 });
    }
    const physicalStock = await db
      .select({
        productId: stockLots.productId,
        warehouseId: stockLots.warehouseId,
        physical: sql<string>`coalesce(sum(${stockLots.quantityCurrent}), 0)`,
      })
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, user.tenantId), eq(stockLots.status, "ativo")))
      .groupBy(stockLots.productId, stockLots.warehouseId);
    const reservedStock = await db
      .select({
        productId: stockReservations.productId,
        warehouseId: stockReservations.warehouseId,
        reserved: sql<string>`coalesce(sum(${stockReservations.quantity} - ${stockReservations.consumedQuantity}), 0)`,
      })
      .from(stockReservations)
      .where(
        and(eq(stockReservations.tenantId, user.tenantId), eq(stockReservations.status, "ativa"))
      )
      .groupBy(stockReservations.productId, stockReservations.warehouseId);
    const reservedByKey = new Map(
      reservedStock.map((row) => [`${row.productId}:${row.warehouseId}`, Number(row.reserved)])
    );
    const byProduct = new Map<string, { physical: number; reserved: number }>();
    const stockByDepot = physicalStock.map((row) => {
      const physical = Number(row.physical);
      const reserved = reservedByKey.get(`${row.productId}:${row.warehouseId}`) ?? 0;
      // sum on lot row avoids double-counting inventory when lot has multiple reservations.
      const current = byProduct.get(row.productId) ?? { physical: 0, reserved: 0 };
      current.physical += physical;
      current.reserved += reserved;
      byProduct.set(row.productId, current);
      return {
        productId: row.productId,
        warehouseId: row.warehouseId,
        physical,
        reserved,
        available: physical - reserved,
      };
    });
    const selectedStock = warehouseFilter
      ? stockByDepot.filter((row) => row.warehouseId === warehouseFilter)
      : stockByDepot;
    const selectedByProduct = new Map<string, { physical: number; reserved: number }>();
    for (const row of selectedStock) {
      const current = selectedByProduct.get(row.productId) ?? { physical: 0, reserved: 0 };
      current.physical += row.physical;
      current.reserved += row.reserved;
      selectedByProduct.set(row.productId, current);
    }
    const enriched = filtered.map((item) => ({
      ...item,
      physicalStockQty:
        (selectedByProduct.get(item.productId) ?? byProduct.get(item.productId))?.physical ?? 0,
      reservedStockQty:
        (selectedByProduct.get(item.productId) ?? byProduct.get(item.productId))?.reserved ?? 0,
      availableStockQty:
        ((selectedByProduct.get(item.productId) ?? byProduct.get(item.productId))?.physical ?? 0) -
        ((selectedByProduct.get(item.productId) ?? byProduct.get(item.productId))?.reserved ?? 0),
    }));

    return NextResponse.json({
      success: true,
      data: enriched,
      warehouses: depots,
      stockByDepot: selectedStock,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
