import { db } from "@/lib/db";
import {
  products,
  stockCycleCounts,
  stockLots,
  stockMovements,
  stockPredictiveMetrics,
  stockRemnants,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

export interface StockKpis {
  criticalCount: number;
  potentialDeficitBrl: number;
  remnantsMonthWeightKg: number;
  remnantsMonthValueBrl: number;
  remnantsMonthVariationPct: number | null;
  agedCapitalBrl: number;
  agedLotsCount: number;
  dioDays: number | null;
  avgLeadTimeDays: number | null;
  remnantsTrackedCount: number;
  remnantsTrackedWeightKg: number;
  lastCycleCountAt: Date | null;
}

type CostUnit = "kg" | "m" | "un" | "t";

/** Converte peso (kg) em valor usando o custo de reposição na unidade do produto. */
export function remnantValueBrl(weightKg: number, unit: CostUnit, costPerUnit: number): number {
  if (unit === "kg") return weightKg * costPerUnit;
  if (unit === "t") return (weightKg / 1000) * costPerUnit;
  return 0;
}

export function variationPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function calculateDio(stockValueBrl: number, consumption90dBrl: number): number | null {
  if (consumption90dBrl <= 0 || stockValueBrl <= 0) return null;
  return Number((stockValueBrl / (consumption90dBrl / 90)).toFixed(0));
}

export async function getStockKpis(tenantId: string): Promise<StockKpis> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const agedLimit = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const metrics = await db
    .select({
      status: stockPredictiveMetrics.predictiveStatus,
      suggestedQty: stockPredictiveMetrics.suggestedPurchaseQty,
      leadTimeDays: stockPredictiveMetrics.leadTimeDays,
      cost: products.replacementCostBase,
    })
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(eq(stockPredictiveMetrics.tenantId, tenantId));

  const critical = metrics.filter((m) => m.status === "CRITICAL_RUPTURE");
  const potentialDeficitBrl = critical.reduce(
    (acc, m) => acc + Number(m.suggestedQty) * Number(m.cost),
    0
  );
  const avgLeadTimeDays =
    metrics.length > 0
      ? Number((metrics.reduce((a, m) => a + m.leadTimeDays, 0) / metrics.length).toFixed(1))
      : null;

  const activeLots = await db
    .select({
      qty: stockLots.quantityCurrent,
      cost: stockLots.unitCost,
      entryDate: stockLots.entryDate,
    })
    .from(stockLots)
    .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.status, "ativo")));

  let stockValue = 0;
  let agedCapitalBrl = 0;
  let agedLotsCount = 0;
  for (const lot of activeLots) {
    const value = Number(lot.qty) * Number(lot.cost);
    stockValue += value;
    if (new Date(lot.entryDate) < agedLimit) {
      agedCapitalBrl += value;
      agedLotsCount += 1;
    }
  }

  const consumption = await db
    .select({ total: stockMovements.totalCost })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        inArray(stockMovements.movementType, ["SAIDA_VENDA", "CORTE_CONSUMO"]),
        gte(stockMovements.createdAt, ninetyDaysAgo)
      )
    );
  const consumption90d = consumption.reduce((a, c) => a + Number(c.total), 0);

  const remnants = await db
    .select({
      weightKg: stockRemnants.weightKg,
      status: stockRemnants.status,
      updatedAt: stockRemnants.updatedAt,
      unit: products.unit,
      cost: products.replacementCostBase,
    })
    .from(stockRemnants)
    .innerJoin(products, eq(products.id, stockRemnants.productId))
    .where(eq(stockRemnants.tenantId, tenantId));

  const tracked = remnants.filter((r) => r.status === "disponivel" || r.status === "reservado");
  const reused = remnants.filter((r) => r.status === "reservado" || r.status === "consumido");
  const inRange = (r: (typeof reused)[number], from: Date, to?: Date) =>
    new Date(r.updatedAt) >= from && (!to || new Date(r.updatedAt) < to);

  const thisMonth = reused.filter((r) => inRange(r, monthStart));
  const prevMonth = reused.filter((r) => inRange(r, prevMonthStart, monthStart));
  const sumWeight = (rows: typeof reused) => rows.reduce((a, r) => a + Number(r.weightKg), 0);
  const sumValue = (rows: typeof reused) =>
    rows.reduce((a, r) => a + remnantValueBrl(Number(r.weightKg), r.unit, Number(r.cost)), 0);

  const [lastCount] = await db
    .select({ countedAt: stockCycleCounts.countedAt })
    .from(stockCycleCounts)
    .where(eq(stockCycleCounts.tenantId, tenantId))
    .orderBy(desc(stockCycleCounts.countedAt))
    .limit(1);

  return {
    criticalCount: critical.length,
    potentialDeficitBrl: Number(potentialDeficitBrl.toFixed(2)),
    remnantsMonthWeightKg: Number(sumWeight(thisMonth).toFixed(3)),
    remnantsMonthValueBrl: Number(sumValue(thisMonth).toFixed(2)),
    remnantsMonthVariationPct: variationPct(sumWeight(thisMonth), sumWeight(prevMonth)),
    agedCapitalBrl: Number(agedCapitalBrl.toFixed(2)),
    agedLotsCount,
    dioDays: calculateDio(stockValue, consumption90d),
    avgLeadTimeDays,
    remnantsTrackedCount: tracked.length,
    remnantsTrackedWeightKg: Number(sumWeight(tracked).toFixed(3)),
    lastCycleCountAt: lastCount?.countedAt ?? null,
  };
}
