/**
 * Custo de reposição atualizado pelo mercado (MVP-01) — MVP-03.
 *
 * Regra: parte do preço-base de reposição do produto e aplica o delta do
 * índice de mercado desde a última compra registrada, com trava de ±20%.
 * Nenhuma chamada externa é feita aqui; usamos apenas a série já ingerida.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  marketAssets,
  marketPriceSeries,
  products,
  stockLots,
  stockMovements,
} from "@/lib/db/schema";
import { applyMarketDelta } from "./pricing";
import {
  clampMarketDelta,
  computeDeltaSince,
  marketSymbolForProduct,
  summarizeMarketMovement,
  type MarketBar,
} from "./market-delta";

export interface ReplacementCostResult {
  productId: string;
  productSku: string;
  productFamily: string;
  productNorm: string;
  marketSymbol: string;
  marketName: string | null;
  /** Preço-base cadastrado no produto (R$/kg). */
  baseCostPerKg: number;
  /** Custo médio ponderado dos lotes em estoque (R$/kg). */
  stockAverageCostPerKg: number | null;
  /** Custo unitário da última entrada de compra (R$/kg). */
  lastPurchaseCostPerKg: number | null;
  lastPurchaseAt: string | null;
  marketLast: number | null;
  marketDeltaPct: number;
  marketChange7dPct: number;
  volatilityPct: number;
  /** Custo de reposição efetivo (R$/kg). */
  replacementCostPerKg: number;
  /** true quando não existe série de mercado e usamos o preço-base. */
  usedFallback: boolean;
}

interface ProductRow {
  id: string;
  tenantId: string;
  sku: string;
  family: string;
  norm: string;
  replacementCostBase: string;
  unit: string;
  weightPerUnit: string;
}

/**
 * Converte o preço-base de reposição para R$/kg.
 *
 * O cadastro do MVP-00 declara `replacement_cost_base` em R$/kg, mas o seed do
 * MVP-02 grava o valor na unidade comercial do produto (`t` para bobina/chapa
 * a granel e `un` para barra). Normalizar aqui mantém o MVP-02 intacto e evita
 * propostas com custo de reposição 1000x acima do real.
 *
 * Produtos com unidade `m` já trazem o preço por quilo no catálogo (o `m` é
 * apenas a unidade de venda), por isso passam direto.
 */
export function normalizeReplacementCostPerKg(input: {
  replacementCostBase: number | string | null;
  unit?: string | null;
  weightPerUnit?: number | string | null;
}): number {
  const base = Number(input.replacementCostBase) || 0;
  if (base <= 0) return 0;

  const unit = (input.unit ?? "kg").toLowerCase();
  if (unit === "t") return Math.round((base / 1000) * 10_000) / 10_000;
  if (unit === "un") {
    const weight = Number(input.weightPerUnit) || 0;
    return weight > 0 ? Math.round((base / weight) * 10_000) / 10_000 : 0;
  }
  return Math.round(base * 10_000) / 10_000;
}

async function loadSeries(
  symbol: string,
  since: Date
): Promise<{ name: string | null; bars: MarketBar[] }> {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  if (!asset) return { name: null, bars: [] };

  const rows = await db
    .select({ timestamp: marketPriceSeries.timestamp, close: marketPriceSeries.close })
    .from(marketPriceSeries)
    .where(and(eq(marketPriceSeries.assetId, asset.id), gte(marketPriceSeries.timestamp, since)))
    .orderBy(desc(marketPriceSeries.timestamp))
    .limit(400);

  return {
    name: asset.name,
    bars: rows.map((row) => ({
      time: Math.floor(row.timestamp.getTime() / 1000),
      close: Number(row.close),
    })),
  };
}

async function stockAverageCost(tenantId: string, product: ProductRow): Promise<number | null> {
  const lots = await db
    .select({ quantity: stockLots.quantityCurrent, unitCost: stockLots.unitCost })
    .from(stockLots)
    .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.productId, product.id)));

  let weighted = 0;
  let totalQty = 0;
  for (const lot of lots) {
    const qty = Number(lot.quantity);
    const cost = Number(lot.unitCost);
    if (qty > 0 && cost > 0) {
      weighted += qty * cost;
      totalQty += qty;
    }
  }

  if (totalQty <= 0) return null;
  // O custo do lote segue a unidade comercial do produto; normalizamos para kg.
  return normalizeReplacementCostPerKg({
    replacementCostBase: weighted / totalQty,
    unit: product.unit,
    weightPerUnit: product.weightPerUnit,
  });
}

async function lastPurchase(
  tenantId: string,
  product: ProductRow
): Promise<{ at: Date; unitCost: number } | null> {
  const [row] = await db
    .select({ at: stockMovements.createdAt, unitCost: stockMovements.unitCost })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.productId, product.id),
        eq(stockMovements.movementType, "ENTRADA_COMPRA")
      )
    )
    .orderBy(desc(stockMovements.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    at: row.at,
    unitCost: normalizeReplacementCostPerKg({
      replacementCostBase: row.unitCost,
      unit: product.unit,
      weightPerUnit: product.weightPerUnit,
    }),
  };
}

export async function getReplacementCost(
  tenantId: string,
  product: ProductRow,
  now: Date = new Date()
): Promise<ReplacementCostResult> {
  const baseCostPerKg = normalizeReplacementCostPerKg({
    replacementCostBase: product.replacementCostBase,
    unit: product.unit,
    weightPerUnit: product.weightPerUnit,
  });
  const marketSymbol = marketSymbolForProduct(product.norm, product.family);

  const purchase = await lastPurchase(tenantId, product);
  // Sem compra registrada, comparamos o mercado dos últimos 30 dias.
  const since = purchase?.at ?? new Date(now.getTime() - 30 * 86_400_000);

  const [series, average] = await Promise.all([
    loadSeries(marketSymbol, new Date(since.getTime() - 14 * 86_400_000)),
    stockAverageCost(tenantId, product),
  ]);

  const delta = series.bars.length ? computeDeltaSince(series.bars, since) : null;
  const movement = summarizeMarketMovement(series.bars);
  const appliedDelta = clampMarketDelta(delta ?? 0);

  return {
    productId: product.id,
    productSku: product.sku,
    productFamily: product.family,
    productNorm: product.norm,
    marketSymbol,
    marketName: series.name,
    baseCostPerKg,
    stockAverageCostPerKg: average,
    lastPurchaseCostPerKg: purchase?.unitCost ?? null,
    lastPurchaseAt: purchase ? purchase.at.toISOString() : null,
    marketLast: movement.last,
    marketDeltaPct: appliedDelta,
    marketChange7dPct: movement.change7dPct,
    volatilityPct: movement.volatilityPct,
    replacementCostPerKg: applyMarketDelta(baseCostPerKg, appliedDelta),
    usedFallback: !delta,
  };
}

/** Resolve o custo de reposição de vários produtos em lote. */
export async function getReplacementCosts(
  tenantId: string,
  productIds: string[],
  now: Date = new Date()
): Promise<Record<string, ReplacementCostResult>> {
  if (!productIds.length) return {};

  const rows = await db
    .select({
      id: products.id,
      tenantId: products.tenantId,
      sku: products.sku,
      family: products.family,
      norm: products.norm,
      replacementCostBase: products.replacementCostBase,
      unit: products.unit,
      weightPerUnit: products.weightPerUnit,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));

  const entries = await Promise.all(
    rows.map(async (row) => [row.id, await getReplacementCost(tenantId, row, now)] as const)
  );

  return Object.fromEntries(entries);
}

/**
 * Volatilidade agregada do orçamento: usamos o maior desvio semanal entre os
 * itens, porque a proposta fica exposta ao insumo mais instável.
 */
export function aggregateVolatility(items: ReplacementCostResult[]): number {
  if (!items.length) return 0;
  return Math.max(...items.map((item) => Math.abs(item.volatilityPct)));
}
