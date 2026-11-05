import { db } from "@/lib/db";
import {
  products,
  stockLots,
  stockRemnants,
  stockMovements,
  stockPredictiveMetrics,
  warehouses,
  suppliers,
  stockCycleCounts,
  stockReservations,
} from "@/lib/db/schema";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { and, desc, eq, sql } from "drizzle-orm";
import { EstoqueClient } from "./estoque-client";
import { getStockKpis } from "@/lib/stock/kpis";
import { getDailyCycleCountCandidates, getCycleInventoryAccuracy } from "@/lib/stock/cycle-count";

export const dynamic = "force-dynamic";

export default async function EstoquePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!(await checkPermission("estoque_retalhos", "read"))) {
    return <Forbidden module="Estoque & Retalhos" />;
  }
  const canWrite = await checkPermission("estoque_retalhos", "write");
  const resolvedParams = searchParams ? await searchParams : {};
  const currentTab = resolvedParams?.tab || "matriz";

  // 1. Fetch products with predictive metrics
  const matrixItems = await db
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
    .where(and(eq(products.tenantId, user.tenantId), eq(products.status, "ativo")));

  const physicalByDepot = await db
    .select({
      productId: stockLots.productId,
      warehouseId: stockLots.warehouseId,
      physical: sql<string>`coalesce(sum(${stockLots.quantityCurrent}), 0)`,
    })
    .from(stockLots)
    .where(and(eq(stockLots.tenantId, user.tenantId), eq(stockLots.status, "ativo")))
    .groupBy(stockLots.productId, stockLots.warehouseId);
  const reservedByDepot = await db
    .select({
      productId: stockReservations.productId,
      warehouseId: stockReservations.warehouseId,
      reserved: sql<string>`coalesce(sum(${stockReservations.quantity}), 0)`,
    })
    .from(stockReservations)
    .where(
      and(eq(stockReservations.tenantId, user.tenantId), eq(stockReservations.status, "ativa"))
    )
    .groupBy(stockReservations.productId, stockReservations.warehouseId);
  const reservedLookup = new Map(
    reservedByDepot.map((row) => [`${row.productId}:${row.warehouseId}`, Number(row.reserved)])
  );
  const stockByProduct = new Map<
    string,
    {
      physical: number;
      reserved: number;
      depots: Array<{ warehouseId: string; physical: number; reserved: number; available: number }>;
    }
  >();
  for (const row of physicalByDepot) {
    const physical = Number(row.physical);
    const reserved = reservedLookup.get(`${row.productId}:${row.warehouseId}`) ?? 0;
    const stock = stockByProduct.get(row.productId) ?? { physical: 0, reserved: 0, depots: [] };
    stock.physical += physical;
    stock.reserved += reserved;
    stock.depots.push({
      warehouseId: row.warehouseId,
      physical,
      reserved,
      available: physical - reserved,
    });
    stockByProduct.set(row.productId, stock);
  }
  for (const item of matrixItems) {
    const stock = stockByProduct.get(item.productId) ?? { physical: 0, reserved: 0, depots: [] };
    Object.assign(item, {
      physicalStockQty: stock.physical,
      reservedStockQty: stock.reserved,
      availableStockQty: stock.physical - stock.reserved,
      stockByDepot: stock.depots,
    });
  }

  // 2. Fetch remnants
  const remnants = await db
    .select({
      id: stockRemnants.id,
      code: stockRemnants.code,
      productId: stockRemnants.productId,
      productSku: products.sku,
      productDescription: products.commercialDescription,
      productNorm: products.norm,
      warehouseId: stockRemnants.warehouseId,
      warehouseName: warehouses.name,
      parentLotId: stockRemnants.parentLotId,
      parentHeatNumber: stockLots.heatNumber,
      thicknessMm: stockRemnants.thicknessMm,
      widthMm: stockRemnants.widthMm,
      lengthMm: stockRemnants.lengthMm,
      diameterMm: stockRemnants.diameterMm,
      weightKg: stockRemnants.weightKg,
      locationAddress: stockRemnants.locationAddress,
      status: stockRemnants.status,
      reservedForQuoteId: stockRemnants.reservedForQuoteId,
      notes: stockRemnants.notes,
      createdAt: stockRemnants.createdAt,
    })
    .from(stockRemnants)
    .innerJoin(products, eq(stockRemnants.productId, products.id))
    .innerJoin(warehouses, eq(stockRemnants.warehouseId, warehouses.id))
    .leftJoin(stockLots, eq(stockRemnants.parentLotId, stockLots.id))
    .where(eq(stockRemnants.tenantId, user.tenantId))
    .orderBy(desc(stockRemnants.createdAt));

  // 3. Fetch physical lots
  const lots = await db
    .select({
      id: stockLots.id,
      lotNumber: stockLots.lotNumber,
      heatNumber: stockLots.heatNumber,
      productId: stockLots.productId,
      productSku: products.sku,
      productDescription: products.commercialDescription,
      unit: products.unit,
      productNorm: products.norm,
      supplierId: stockLots.supplierId,
      supplierName: suppliers.tradeName,
      warehouseId: stockLots.warehouseId,
      warehouseName: warehouses.name,
      quantityInitial: stockLots.quantityInitial,
      quantityCurrent: stockLots.quantityCurrent,
      unitCost: stockLots.unitCost,
      locationAddress: stockLots.locationAddress,
      entryDate: stockLots.entryDate,
      status: stockLots.status,
      createdAt: stockLots.createdAt,
    })
    .from(stockLots)
    .innerJoin(products, eq(stockLots.productId, products.id))
    .innerJoin(warehouses, eq(stockLots.warehouseId, warehouses.id))
    .leftJoin(suppliers, eq(stockLots.supplierId, suppliers.id))
    .where(eq(stockLots.tenantId, user.tenantId))
    .orderBy(desc(stockLots.createdAt));

  // 4. Fetch movements history
  const movements = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productSku: products.sku,
      productDescription: products.commercialDescription,
      lotId: stockMovements.lotId,
      lotNumber: stockLots.lotNumber,
      heatNumber: stockLots.heatNumber,
      warehouseId: stockMovements.warehouseId,
      warehouseName: warehouses.name,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      totalCost: stockMovements.totalCost,
      referenceDocument: stockMovements.referenceDocument,
      notes: stockMovements.notes,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(stockLots, eq(stockMovements.lotId, stockLots.id))
    .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
    .where(eq(stockMovements.tenantId, user.tenantId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(50);

  // 5. Auxiliaries: Warehouses, Suppliers, All Products
  const allProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      commercialDescription: products.commercialDescription,
      norm: products.norm,
      family: products.family,
      densityGCm3: products.densityGCm3,
    })
    .from(products)
    .where(and(eq(products.tenantId, user.tenantId), eq(products.status, "ativo")));

  const allWarehouses = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
    })
    .from(warehouses)
    .where(eq(warehouses.tenantId, user.tenantId));

  const allSuppliers = await db
    .select({
      id: suppliers.id,
      tradeName: suppliers.tradeName,
      legalName: suppliers.legalName,
    })
    .from(suppliers)
    .where(eq(suppliers.tenantId, user.tenantId));

  // 6. Cycle Count candidates & accuracy
  const cycleCountCandidates = await getDailyCycleCountCandidates(user.tenantId);
  const accuracy = await getCycleInventoryAccuracy(user.tenantId);
  const kpis = await getStockKpis(user.tenantId);

  return (
    <EstoqueClient
      initialTab={currentTab}
      matrixItems={matrixItems}
      remnants={remnants}
      lots={lots}
      movements={movements}
      products={allProducts}
      warehouses={allWarehouses}
      suppliers={allSuppliers}
      cycleCountCandidates={cycleCountCandidates}
      accuracyPct={accuracy.accuracyPct}
      kpis={kpis}
      canWrite={canWrite}
    />
  );
}
