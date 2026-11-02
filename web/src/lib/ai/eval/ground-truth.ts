import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  marketAssets,
  marketPriceSeries,
  products,
  quotes,
  stockPredictiveMetrics,
  stockRemnants,
  suppliers,
  users,
} from "@/lib/db/schema";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import type { MarketTruth, RiskSku, Truth } from "./truth";

const DAY_MS = 86_400_000;
const IMPACT_FAMILY = "chapa_grossa";
const IMPACT_PCT = 6;

async function marketTruth(symbol: string): Promise<MarketTruth> {
  const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  if (!asset) return { last: null, change7d: null, change15d: null, change30d: null };

  const [latest] = await db
    .select({ close: marketPriceSeries.close })
    .from(marketPriceSeries)
    .where(eq(marketPriceSeries.assetId, asset.id))
    .orderBy(desc(marketPriceSeries.timestamp))
    .limit(1);

  // Mesma definição da ferramenta: último fechamento vs. o mais antigo dentro da janela.
  const change = async (days: number) => {
    const rows = await db
      .select({ close: marketPriceSeries.close })
      .from(marketPriceSeries)
      .where(
        and(
          eq(marketPriceSeries.assetId, asset.id),
          gte(marketPriceSeries.timestamp, new Date(Date.now() - days * DAY_MS))
        )
      )
      .orderBy(desc(marketPriceSeries.timestamp));
    if (rows.length === 0) return null;
    const newest = Number(rows[0].close);
    const oldest = Number(rows[rows.length - 1].close);
    return oldest === 0 ? null : Number((((newest - oldest) / oldest) * 100).toFixed(2));
  };

  return {
    last: latest ? Number(latest.close) : null,
    change7d: await change(7),
    change15d: await change(15),
    change30d: await change(30),
  };
}

export async function buildTruth(tenantId: string): Promise<Truth> {
  const skuRows = await db.select({ sku: products.sku }).from(products).where(eq(products.tenantId, tenantId));

  const riskRows = await db
    .select({
      sku: products.sku,
      family: products.family,
      coverage: stockPredictiveMetrics.coverageDays,
      status: stockPredictiveMetrics.predictiveStatus,
      suggested: stockPredictiveMetrics.suggestedPurchaseQty,
    })
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(
      and(
        eq(stockPredictiveMetrics.tenantId, tenantId),
        inArray(stockPredictiveMetrics.predictiveStatus, ["CRITICAL_RUPTURE", "WARNING"])
      )
    )
    .orderBy(asc(stockPredictiveMetrics.coverageDays), asc(products.sku));
  const risk: RiskSku[] = riskRows.map((r) => ({
    sku: r.sku,
    family: r.family,
    coverageDays: Number(r.coverage),
    status: r.status as RiskSku["status"],
    suggestedQty: Number(r.suggested),
  }));

  const [q] = await db
    .select({
      total: sql<number>`count(*)`,
      approved: sql<number>`count(*) filter (where ${quotes.status} = 'aprovado')`,
      approvedAvg: sql<string | null>`avg(${quotes.grossMarginPct}) filter (where ${quotes.status} = 'aprovado')`,
      sent: sql<number>`count(*) filter (where ${quotes.status} = 'enviado')`,
      sentTotal: sql<string>`coalesce(sum(${quotes.totalAmount}) filter (where ${quotes.status} = 'enviado'), 0)`,
      blocked: sql<number>`count(*) filter (where ${quotes.status} = 'bloqueado_margem')`,
      openValue: sql<string>`coalesce(sum(${quotes.totalAmount}) filter (where ${quotes.status} in ('enviado','em_negociacao','bloqueado_margem')), 0)`,
    })
    .from(quotes)
    .where(eq(quotes.tenantId, tenantId));

  const [seller] = await db
    .select({ name: users.name, count: sql<number>`count(*)` })
    .from(quotes)
    .innerJoin(users, eq(users.id, quotes.sellerId))
    .where(eq(quotes.tenantId, tenantId))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`count(*)`), asc(users.name))
    .limit(1);

  const remnantRows = await db
    .select({ thickness: stockRemnants.thicknessMm })
    .from(stockRemnants)
    .where(and(eq(stockRemnants.tenantId, tenantId), eq(stockRemnants.status, "disponivel")));

  const supplierRows = await db
    .select({ legal: suppliers.legalName, trade: suppliers.tradeName, lead: suppliers.leadTimeDays })
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.active, true)))
    .orderBy(asc(suppliers.leadTimeDays));
  const minLead = supplierRows[0]?.lead;
  const topSuppliers =
    minLead == null ? null : supplierRows.filter((s) => s.lead === minLead);

  const [stockValue] = await db
    .select({
      // Independente das ferramentas: saldo em unidade de estoque → kg (kg, t, un) × R$/kg.
      value: sql<string>`coalesce(sum(${stockPredictiveMetrics.currentStockQty}::numeric * (case ${products.unit} when 'kg' then 1 when 't' then 1000 when 'un' then ${products.weightPerUnit}::numeric else 0 end) * ${products.replacementCostBase}::numeric), 0)`,
    })
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(and(eq(stockPredictiveMetrics.tenantId, tenantId), eq(products.family, IMPACT_FAMILY)));
  const impactBase = Number(stockValue?.value ?? 0) + Number(q?.openValue ?? 0);

  return {
    skus: skuRows.map((s) => s.sku),
    risk,
    market: {
      ptax: await marketTruth(ASSET_SYMBOLS.PTAX),
      aluminium: await marketTruth(ASSET_SYMBOLS.LME_ALU),
      hrc: await marketTruth(ASSET_SYMBOLS.HRC_US),
    },
    quotes: {
      totalCount: Number(q?.total ?? 0),
      approvedCount: Number(q?.approved ?? 0),
      approvedAvgMargin: q?.approvedAvg != null ? Number(Number(q.approvedAvg).toFixed(2)) : null,
      sentCount: Number(q?.sent ?? 0),
      sentTotal: Number(q?.sentTotal ?? 0),
      blockedCount: Number(q?.blocked ?? 0),
      seller: seller ? { name: seller.name, count: Number(seller.count) } : null,
    },
    remnants: {
      availableCount: remnantRows.length,
      thicknessesMm: remnantRows.map((r) => Number(r.thickness)),
    },
    suppliers: topSuppliers
      ? {
          minLeadTimeDays: minLead as number,
          names: topSuppliers.flatMap((s) => [s.legal, s.trade].filter((n): n is string => !!n)),
        }
      : null,
    impact: { family: IMPACT_FAMILY, pct: IMPACT_PCT, total: Number((impactBase * (IMPACT_PCT / 100)).toFixed(2)) },
  };
}
