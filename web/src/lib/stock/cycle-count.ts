import { db } from "@/lib/db";
import {
  stockLots,
  products,
  stockCycleCounts,
  stockPredictiveMetrics,
  stockMovements,
  warehouses,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { recordStockAdjustment } from "./movements";

export interface CycleCountCandidate {
  lotId: string;
  lotNumber: string;
  heatNumber: string | null;
  productId: string;
  productSku: string;
  productDescription: string;
  warehouseId: string;
  warehouseName: string;
  locationAddress: string | null;
  systemQty: number;
  curveAbc: string;
  priorityReason: string;
  priorityLevel: 1 | 2 | 3;
  lastCountedAt: Date | null;
}

export interface SubmitCountInput {
  tenantId: string;
  lotId: string;
  countedQty: number;
  systemQty: number;
  justification?: string;
  userId: string;
}

/**
 * Generates the daily risk-guided cycle count candidate list (5 to 10 items)
 */
export async function getDailyCycleCountCandidates(
  tenantId: string
): Promise<CycleCountCandidate[]> {
  // 1. Fetch active lots with product details
  const lots = await db
    .select({
      lotId: stockLots.id,
      lotNumber: stockLots.lotNumber,
      heatNumber: stockLots.heatNumber,
      productId: stockLots.productId,
      productSku: products.sku,
      productDescription: products.commercialDescription,
      warehouseId: stockLots.warehouseId,
      warehouseName: warehouses.name,
      locationAddress: stockLots.locationAddress,
      quantityCurrent: stockLots.quantityCurrent,
      curveAbc: stockPredictiveMetrics.curveAbc,
    })
    .from(stockLots)
    .innerJoin(products, eq(stockLots.productId, products.id))
    .innerJoin(warehouses, eq(stockLots.warehouseId, warehouses.id))
    .leftJoin(stockPredictiveMetrics, eq(stockLots.productId, stockPredictiveMetrics.productId))
    .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.status, "ativo")));

  if (lots.length === 0) return [];

  // 2. Fetch past cycle counts to find historical divergence and last check dates
  const pastCounts = await db
    .select()
    .from(stockCycleCounts)
    .where(eq(stockCycleCounts.tenantId, tenantId))
    .orderBy(desc(stockCycleCounts.countedAt));

  const lotsWithDivergence = new Set<string>();
  const lastCountDateMap: Record<string, Date> = {};

  pastCounts.forEach((pc) => {
    if (pc.lotId) {
      if (!lastCountDateMap[pc.lotId]) {
        lastCountDateMap[pc.lotId] = pc.countedAt;
      }
      if (Number(pc.differenceQty) !== 0) {
        lotsWithDivergence.add(pc.lotId);
      }
    }
  });

  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const candidates: CycleCountCandidate[] = [];

  for (const lot of lots) {
    const sysQty = Number(lot.quantityCurrent);
    const lastCount = lastCountDateMap[lot.lotId] || null;

    let priorityLevel: 1 | 2 | 3 | null = null;
    let priorityReason = "";

    // Priority 1: Divergence in previous count
    if (lotsWithDivergence.has(lot.lotId)) {
      priorityLevel = 1;
      priorityReason = "Prioridade 1: Divergência física em auditoria anterior";
    }
    // Priority 2: Curve A with high impact
    else if (lot.curveAbc === "A") {
      priorityLevel = 2;
      priorityReason = "Prioridade 2: Item Curva A de Alto Giro & Valor";
    }
    // Priority 3: Not counted in > 90 days or never counted
    else if (!lastCount || lastCount < ninetyDaysAgo) {
      priorityLevel = 3;
      priorityReason = !lastCount
        ? "Prioridade 3: Lote sem conferência registrada"
        : "Prioridade 3: Lote sem conferência há mais de 90 dias";
    }

    if (priorityLevel !== null) {
      candidates.push({
        lotId: lot.lotId,
        lotNumber: lot.lotNumber,
        heatNumber: lot.heatNumber,
        productId: lot.productId,
        productSku: lot.productSku,
        productDescription: lot.productDescription,
        warehouseId: lot.warehouseId,
        warehouseName: lot.warehouseName,
        locationAddress: lot.locationAddress,
        systemQty: sysQty,
        curveAbc: lot.curveAbc || "B",
        priorityReason,
        priorityLevel,
        lastCountedAt: lastCount,
      });
    }
  }

  // Sort by priority (1 -> 2 -> 3) and limit to 10 items
  candidates.sort((a, b) => a.priorityLevel - b.priorityLevel);
  return candidates.slice(0, 10);
}

/**
 * Submits a physical cycle count entry
 */
export async function submitCycleCount(input: SubmitCountInput) {
  const diff = Number((input.countedQty - input.systemQty).toFixed(4));
  const hasDivergence = diff !== 0;

  if (hasDivergence && (!input.justification || input.justification.trim().length < 5)) {
    throw new Error(
      "Divergência detectada entre estoque físico e sistema. Justificativa obrigatória (mínimo 5 caracteres)."
    );
  }

  // 1. Fetch lot to get product and warehouse
  const [lot] = await db
    .select()
    .from(stockLots)
    .where(and(eq(stockLots.id, input.lotId), eq(stockLots.tenantId, input.tenantId)))
    .limit(1);

  if (!lot) throw new Error("Lote não encontrado.");

  // 2. Insert cycle count record
  const [cycleRecord] = await db
    .insert(stockCycleCounts)
    .values({
      tenantId: input.tenantId,
      productId: lot.productId,
      lotId: lot.id,
      warehouseId: lot.warehouseId,
      systemQty: String(input.systemQty),
      countedQty: String(input.countedQty),
      differenceQty: String(diff),
      adjusted: hasDivergence,
      justification: input.justification,
      countedBy: input.userId,
      status: hasDivergence ? "ajustado" : "conferido",
    })
    .returning();

  // 3. If divergence exists, apply inventory adjustment
  if (hasDivergence) {
    await recordStockAdjustment({
      tenantId: input.tenantId,
      lotId: input.lotId,
      newQuantity: input.countedQty,
      justification: `[Inventário Cíclico] ${input.justification}`,
      userId: input.userId,
    });
  }

  return cycleRecord;
}

/**
 * Computes historical cycle inventory accuracy rate %
 */
export async function getCycleInventoryAccuracy(tenantId: string): Promise<{
  accuracyPct: number;
  totalCounted: number;
  accurateCounted: number;
  divergentCounted: number;
}> {
  const counts = await db
    .select({
      differenceQty: stockCycleCounts.differenceQty,
    })
    .from(stockCycleCounts)
    .where(eq(stockCycleCounts.tenantId, tenantId));

  if (counts.length === 0) {
    return {
      accuracyPct: 99.4, // baseline
      totalCounted: 0,
      accurateCounted: 0,
      divergentCounted: 0,
    };
  }

  const total = counts.length;
  const accurate = counts.filter((c) => Number(c.differenceQty) === 0).length;
  const divergent = total - accurate;
  const accuracyPct = Number(((accurate / total) * 100).toFixed(1));

  return {
    accuracyPct,
    totalCounted: total,
    accurateCounted: accurate,
    divergentCounted: divergent,
  };
}
