import { db } from "@/lib/db";
import {
  products,
  stockLots,
  stockMovements,
  stockPredictiveMetrics,
  stockReservations,
} from "@/lib/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { valueAtCostPerKg } from "./units";
import { buildLeadTimeResolver, loadLeadTimeSnapshotSources } from "@/lib/suppliers/lead-time";
import type { LeadTimeSource, ResolvedLeadTime } from "@/lib/suppliers/types";

export interface ConsumptionStats {
  avgDaily30d: number;
  avgDaily60d: number;
  avgDaily90d: number;
  weightedAvgDaily: number;
  stdDevDaily: number;
  coefficientOfVariation: number;
}

export type PredictiveStatus =
  | "CRITICAL_RUPTURE"
  | "WARNING"
  | "HEALTHY"
  | "EXCESS"
  /** Lead time não definido (LAC-02): não é ruptura, nem cobertura, nem zero dias. */
  | "SEM_LEAD_TIME";

export interface PredictiveEngineResult {
  productId: string;
  tenantId: string;
  currentStockQty: number;
  avgDailyConsumption30d: number;
  /** Nulo = lead time não definido. Nunca preenchido por default de código. */
  leadTimeDays: number | null;
  /** Origem do lead time resolvido (LAC-02). Nula quando `leadTimeDays` é nulo. */
  leadTimeSource: LeadTimeSource | null;
  coverageDays: number;
  safetyStockQty: number;
  reorderPointQty: number;
  predictiveStatus: PredictiveStatus;
  suggestedPurchaseQty: number;
  suggestedPurchaseDate: Date | null;
  curveAbc: "A" | "B" | "C";
  curveXyz: "X" | "Y" | "Z";
}

/**
 * Standard Z-factor for 95% service level (normal distribution)
 */
export const Z_FACTOR_95 = 1.645;

/**
 * Pure calculation function for daily consumption and standard deviation
 */
export function calculateConsumptionMetrics(
  dailyConsumptions90Days: number[] // 90 items, index 0 = today, index 89 = 89 days ago
): ConsumptionStats {
  const c30 = dailyConsumptions90Days.slice(0, 30);
  const c60 = dailyConsumptions90Days.slice(30, 60);
  const c90 = dailyConsumptions90Days.slice(60, 90);

  const sum = (arr: number[]) => arr.reduce((acc, val) => acc + val, 0);

  const avg30 = sum(c30) / Math.max(1, c30.length);
  const avg60 = c60.length > 0 ? sum(c60) / c60.length : avg30;
  const avg90 = c90.length > 0 ? sum(c90) / c90.length : avg60;

  // Weighted average: 50% last 30d, 30% 31-60d, 20% 61-90d
  const weighted = 0.5 * avg30 + 0.3 * avg60 + 0.2 * avg90;

  // Standard deviation over active period (30 days or 90 days)
  const nonZeroCount = dailyConsumptions90Days.filter((x) => x > 0).length;
  const period = nonZeroCount > 0 ? dailyConsumptions90Days : c30;
  const mean = period.reduce((acc, val) => acc + val, 0) / period.length;

  const variance =
    period.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / Math.max(1, period.length);
  const stdDev = Math.sqrt(variance);

  const cv = weighted > 0 ? stdDev / weighted : 0;

  return {
    avgDaily30d: Number(avg30.toFixed(4)),
    avgDaily60d: Number(avg60.toFixed(4)),
    avgDaily90d: Number(avg90.toFixed(4)),
    weightedAvgDaily: Number(weighted.toFixed(4)),
    stdDevDaily: Number(stdDev.toFixed(4)),
    coefficientOfVariation: Number(cv.toFixed(4)),
  };
}

/**
 * Calculates safety stock using SS = Z * sigma * sqrt(LT)
 */
export function calculateSafetyStock(
  stdDev: number,
  leadTimeDays: number,
  avgDaily: number
): number {
  if (leadTimeDays <= 0) return 0;

  let ss = Z_FACTOR_95 * stdDev * Math.sqrt(leadTimeDays);

  // Fallback: If stdDev is 0 but there is steady consumption, minimal buffer 20% of lead time consumption
  if (ss === 0 && avgDaily > 0) {
    ss = 0.2 * avgDaily * leadTimeDays;
  }

  return Number(ss.toFixed(4));
}

/**
 * Calculates Reorder Point (ROP = d * LT + SS)
 */
export function calculateReorderPoint(
  avgDaily: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  const rop = avgDaily * leadTimeDays + safetyStock;
  return Number(rop.toFixed(4));
}

/**
 * Calculates stock coverage in days
 */
export function calculateCoverageDays(currentStock: number, avgDaily: number): number {
  if (currentStock <= 0) return 0;
  if (avgDaily <= 0) return 999.0; // Infinite/no consumption
  const coverage = currentStock / avgDaily;
  return Number(Math.min(999.0, coverage).toFixed(1));
}

/** Status possível quando o lead time está definido. `SEM_LEAD_TIME` fica fora deste conjunto. */
export type ResolvedPredictiveStatus = Exclude<PredictiveStatus, "SEM_LEAD_TIME">;

/**
 * Determines predictive status based on Coverage vs Lead Time & ROP
 */
export function determinePredictiveStatus(
  currentStock: number,
  coverageDays: number,
  leadTimeDays: number,
  reorderPoint: number
): ResolvedPredictiveStatus {
  if (currentStock <= 0 || coverageDays < leadTimeDays) {
    return "CRITICAL_RUPTURE";
  }

  if (coverageDays <= leadTimeDays * 1.3 || currentStock <= reorderPoint) {
    return "WARNING";
  }

  if (coverageDays > 180) {
    return "EXCESS";
  }

  return "HEALTHY";
}

/**
 * Calculates suggested purchase quantity and recommended purchase order date
 */
export function calculateSuggestedPurchase(
  status: ResolvedPredictiveStatus,
  currentStock: number,
  reorderPoint: number,
  avgDaily: number,
  coverageDays: number,
  leadTimeDays: number,
  baseDate: Date = new Date()
): { quantity: number; date: Date | null } {
  if (status !== "CRITICAL_RUPTURE" && status !== "WARNING") {
    return { quantity: 0, date: null };
  }

  // Recommended replenishment: reach ROP + 30 days consumption buffer
  const targetBuffer = avgDaily * 30;
  const rawQty = Math.max(0, reorderPoint - currentStock + targetBuffer);

  // Round up to nearest unit or 100kg if substantial
  const quantity = Number(Math.max(1, rawQty).toFixed(4));

  // Determine purchase date
  let date: Date;
  if (status === "CRITICAL_RUPTURE" || coverageDays <= leadTimeDays) {
    date = new Date(baseDate); // Immediate purchase needed!
  } else {
    // Buy before coverage drops below lead time
    const daysUntilOrder = Math.max(0, Math.floor(coverageDays - leadTimeDays));
    date = new Date(baseDate.getTime() + daysUntilOrder * 24 * 60 * 60 * 1000);
  }

  return { quantity, date };
}

export interface PredictiveDecisionInput {
  /** Lead time já resolvido pela LAC-02 (ver `lib/suppliers/lead-time.ts`). */
  resolvedLeadTime: Pick<ResolvedLeadTime, "days" | "source">;
  currentStock: number;
  avgDailyConsumption: number;
  stdDevDaily: number;
  coverageDays: number;
  /** Data de referência da sugestão de compra; injetada nos testes. */
  referenceDate?: Date;
}

export interface PredictiveDecision {
  leadTimeDays: number | null;
  leadTimeSource: LeadTimeSource | null;
  safetyStockQty: number;
  reorderPointQty: number;
  predictiveStatus: PredictiveStatus;
  suggestedPurchaseQty: number;
  suggestedPurchaseDate: Date | null;
}

/**
 * Consolida a decisão preditiva do produto a partir do lead time resolvido (LAC-02).
 *
 * Ausência de lead time (`days === null`) NÃO é ruptura e NÃO vira 0 dias nem default:
 * - status próprio `SEM_LEAD_TIME`, fora das contagens de risco e da fila de compras;
 * - SS, ROP e sugestão = 0 e data nula, porque as três fórmulas dependem de L;
 * - consumo, cobertura e curvas ABC/XYZ continuam calculados e exibidos.
 *
 * Quando resolvido, a origem (`leadTimeSource`) é persistida junto com os dias; quando
 * ausente, os dois campos vão nulos — o banco não guarda `unavailable` como se fosse fonte.
 */
export function calculatePredictiveDecision(input: PredictiveDecisionInput): PredictiveDecision {
  const { days } = input.resolvedLeadTime;

  if (days === null) {
    return {
      leadTimeDays: null,
      leadTimeSource: null,
      safetyStockQty: 0,
      reorderPointQty: 0,
      predictiveStatus: "SEM_LEAD_TIME",
      suggestedPurchaseQty: 0,
      suggestedPurchaseDate: null,
    };
  }

  const safetyStockQty = calculateSafetyStock(input.stdDevDaily, days, input.avgDailyConsumption);
  const reorderPointQty = calculateReorderPoint(input.avgDailyConsumption, days, safetyStockQty);
  const predictiveStatus = determinePredictiveStatus(
    input.currentStock,
    input.coverageDays,
    days,
    reorderPointQty
  );
  const { quantity, date } = calculateSuggestedPurchase(
    predictiveStatus,
    input.currentStock,
    reorderPointQty,
    input.avgDailyConsumption,
    input.coverageDays,
    days,
    input.referenceDate ?? new Date()
  );

  return {
    leadTimeDays: days,
    // Resolver só devolve `unavailable` com `days === null`; com dias preenchidos a origem é real.
    leadTimeSource: input.resolvedLeadTime.source,
    safetyStockQty,
    reorderPointQty,
    predictiveStatus,
    suggestedPurchaseQty: quantity,
    suggestedPurchaseDate: date,
  };
}

/**
 * Classifies XYZ curve by demand variability
 */
export function classifyCurveXyz(cv: number): "X" | "Y" | "Z" {
  if (cv <= 0.25) return "X";
  if (cv <= 0.5) return "Y";
  return "Z";
}

/**
 * Recalculates predictive stock metrics for an entire tenant
 */
export async function recalculatePredictiveMetricsForTenant(tenantId: string) {
  // 1. Fetch all active products
  const activeProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      replacementCostBase: products.replacementCostBase,
      unit: products.unit,
      family: products.family,
      weightPerUnit: products.weightPerUnit,
      thicknessMm: products.thicknessMm,
      widthMm: products.widthMm,
      lengthMm: products.lengthMm,
      diameterMm: products.diameterMm,
      wallMm: products.wallMm,
      densityGCm3: products.densityGCm3,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.status, "ativo")));

  if (activeProducts.length === 0) return [];

  const productIds = activeProducts.map((p) => p.id);

  // 2. Fetch current active stock balances by product
  const lots = await db
    .select({
      productId: stockLots.productId,
      quantityCurrent: stockLots.quantityCurrent,
      unitCost: stockLots.unitCost,
    })
    .from(stockLots)
    .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.status, "ativo")));

  const stockByProduct: Record<string, number> = {};
  const reservedByProduct: Record<string, number> = {};
  const lotValueByProduct: Record<string, number> = {};
  lots.forEach((lot) => {
    const qty = Number(lot.quantityCurrent) || 0;
    stockByProduct[lot.productId] = (stockByProduct[lot.productId] || 0) + qty;
    lotValueByProduct[lot.productId] =
      (lotValueByProduct[lot.productId] || 0) + qty * (Number(lot.unitCost) || 0);
  });
  const activeReservations = await db
    .select({ productId: stockReservations.productId, quantity: stockReservations.quantity })
    .from(stockReservations)
    .where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.status, "ativa")));
  activeReservations.forEach((reservation) => {
    reservedByProduct[reservation.productId] =
      (reservedByProduct[reservation.productId] || 0) + (Number(reservation.quantity) || 0);
  });

  // 3. Preferência por produto (LAC-02) → lead time geral do fornecedor preferido.
  //    Sem preferência/dado: unknown; estimativa do primeiro lote não vira padrão.
  //    Sem default numérico: ausência volta `unknown` e o produto recebe SEM_LEAD_TIME.
  const now = new Date();
  const leadTimeSources = await loadLeadTimeSnapshotSources({ tenantId, productIds });
  const resolveLeadTime = buildLeadTimeResolver(leadTimeSources, { now });

  // 4. Fetch movements over last 90 days for consumption
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const movements = await db
    .select({
      productId: stockMovements.productId,
      quantity: stockMovements.quantity,
      movementType: stockMovements.movementType,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        gte(stockMovements.createdAt, ninetyDaysAgo),
        inArray(stockMovements.productId, productIds)
      )
    );

  // Group daily consumption per product
  const dailyConsumptionMap: Record<string, number[]> = {};
  productIds.forEach((pid) => {
    dailyConsumptionMap[pid] = new Array(90).fill(0);
  });

  movements.forEach((m) => {
    const qty = Number(m.quantity);
    // Negative quantities represent outgoing / consumption
    if (qty < 0 || m.movementType === "SAIDA_VENDA" || m.movementType === "CORTE_CONSUMO") {
      const consumption = Math.abs(qty);
      const diffTime = Math.abs(now.getTime() - new Date(m.createdAt).getTime());
      const dayDiff = Math.min(89, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      dailyConsumptionMap[m.productId][dayDiff] += consumption;
    }
  });

  // 5. Pre-calculate values for ABC Curve (Value of stock or 90d consumption)
  const productValues: { id: string; value: number }[] = activeProducts.map((p) => {
    const stockQty = stockByProduct[p.id] || 0;
    const cost = Number(p.replacementCostBase) || 5;
    // Saldo em unidade de estoque × R$/kg só faz sentido depois de converter para kg.
    // Se a conversão for desconhecida, usa o valor contábil dos lotes (já em R$ por unidade de estoque).
    const value = valueAtCostPerKg(stockQty, cost, p) ?? lotValueByProduct[p.id] ?? 0;
    return { id: p.id, value };
  });

  // Sort descending for ABC
  productValues.sort((a, b) => b.value - a.value);
  const totalValue = productValues.reduce((acc, curr) => acc + curr.value, 0);

  const abcMap: Record<string, "A" | "B" | "C"> = {};
  let accumulated = 0;
  productValues.forEach((item) => {
    accumulated += item.value;
    const pct = totalValue > 0 ? (accumulated / totalValue) * 100 : 0;
    if (pct <= 80) {
      abcMap[item.id] = "A";
    } else if (pct <= 95) {
      abcMap[item.id] = "B";
    } else {
      abcMap[item.id] = "C";
    }
  });

  // 6. Compute metrics per product
  const results: PredictiveEngineResult[] = [];

  for (const product of activeProducts) {
    const pid = product.id;
    // Cobertura/risco usam disponível. Valor de estoque e curva ABC preservam físico.
    const currentStock = (stockByProduct[pid] || 0) - (reservedByProduct[pid] || 0);
    const consumptions = dailyConsumptionMap[pid] || new Array(90).fill(0);

    const stats = calculateConsumptionMetrics(consumptions);
    const coverageDays = calculateCoverageDays(currentStock, stats.weightedAvgDaily);

    // Lead time resolvido pela LAC-02; ausência não recebe default nem vira ruptura.
    const decision = calculatePredictiveDecision({
      resolvedLeadTime: resolveLeadTime(pid),
      currentStock,
      avgDailyConsumption: stats.weightedAvgDaily,
      stdDevDaily: stats.stdDevDaily,
      coverageDays,
      referenceDate: now,
    });

    const curveAbc = abcMap[pid] || "B";
    const curveXyz = classifyCurveXyz(stats.coefficientOfVariation);

    const result: PredictiveEngineResult = {
      productId: pid,
      tenantId,
      currentStockQty: currentStock,
      avgDailyConsumption30d: stats.avgDaily30d,
      leadTimeDays: decision.leadTimeDays,
      leadTimeSource: decision.leadTimeSource,
      coverageDays,
      safetyStockQty: decision.safetyStockQty,
      reorderPointQty: decision.reorderPointQty,
      predictiveStatus: decision.predictiveStatus,
      suggestedPurchaseQty: decision.suggestedPurchaseQty,
      suggestedPurchaseDate: decision.suggestedPurchaseDate,
      curveAbc,
      curveXyz,
    };

    results.push(result);

    // Upsert into stock_predictive_metrics
    await db
      .insert(stockPredictiveMetrics)
      .values({
        productId: pid,
        tenantId,
        currentStockQty: String(currentStock),
        avgDailyConsumption30d: String(stats.avgDaily30d),
        leadTimeDays: decision.leadTimeDays,
        leadTimeSource: decision.leadTimeSource,
        coverageDays: String(coverageDays),
        safetyStockQty: String(decision.safetyStockQty),
        reorderPointQty: String(decision.reorderPointQty),
        predictiveStatus: decision.predictiveStatus,
        suggestedPurchaseQty: String(decision.suggestedPurchaseQty),
        suggestedPurchaseDate: decision.suggestedPurchaseDate,
        curveAbc,
        curveXyz,
        calculatedAt: now,
      })
      .onConflictDoUpdate({
        target: stockPredictiveMetrics.productId,
        set: {
          currentStockQty: String(currentStock),
          avgDailyConsumption30d: String(stats.avgDaily30d),
          leadTimeDays: decision.leadTimeDays,
          leadTimeSource: decision.leadTimeSource,
          coverageDays: String(coverageDays),
          safetyStockQty: String(decision.safetyStockQty),
          reorderPointQty: String(decision.reorderPointQty),
          predictiveStatus: decision.predictiveStatus,
          suggestedPurchaseQty: String(decision.suggestedPurchaseQty),
          suggestedPurchaseDate: decision.suggestedPurchaseDate,
          curveAbc,
          curveXyz,
          calculatedAt: now,
        },
      });
  }

  return results;
}
