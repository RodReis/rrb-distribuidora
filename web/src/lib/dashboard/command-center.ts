import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  dailyBriefings,
  importParityConfigs,
  products,
  quotes,
  stockPredictiveMetrics,
  users,
} from "@/lib/db/schema";
import { getStockKpis, type StockKpis } from "@/lib/stock/kpis";
import { valueAtCostPerKg } from "@/lib/stock/units";
import { getQuotes, type Quote } from "@/lib/market/queries";
import { currentSpreadPct } from "@/lib/market/alerts";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import { MARKET_TIMEZONE } from "@/lib/market/schedule";
import { computeQuoteValidity } from "@/lib/quotes/pricing";
import {
  marginDeltaPp,
  quotesLevel,
  rankRecommendations,
  stockLevel,
  volatilityLevel,
  worstLevel,
  type Level,
  type Recommendation,
} from "./insights";

const OPEN_STATUSES = ["enviado", "em_negociacao", "bloqueado_margem"] as const;

export interface DecisionItem {
  id: string;
  quoteNumber: number;
  customer: string;
  seller: string;
  totalAmount: number;
  marginPct: number;
  minMarginPct: number;
}

export interface RiskRow {
  key: string;
  title: string;
  level: Level;
  badge: string;
  text: string;
  next: { label: string; href: string };
}

export interface ThermometerItem {
  department: string;
  level: Level;
  label: string;
}

export interface BriefingView {
  id: string;
  briefingDate: string;
  summaryText: string;
  createdAt: string;
  sentViaEmailAt: string | null;
  criticalRupturesCount: number;
  pendingQuotesCount: number;
}

export interface CommandCenterData {
  todayInSaoPaulo: string;
  quotes: {
    openCount: number;
    openTotal: number;
    blockedCount: number;
    blockedTotal: number;
    approvedMonthCount: number;
    marginMonthPct: number | null;
    marginPrevMonthPct: number | null;
    marginDeltaPp: number | null;
  };
  stock: StockKpis & { warningCount: number };
  market: {
    ptax: Quote | null;
    aluminium: Quote | null;
    hrc: Quote | null;
    importSpreadPct: number | null;
    parityConfigsCount: number;
    proposalValidityLabel: string | null;
  };
  decisions: { pending: DecisionItem[]; resolvedLast24h: number };
  risks: RiskRow[];
  thermometer: ThermometerItem[];
  globalLevel: Level;
  recommendations: Recommendation[];
  briefing: BriefingView | null;
}

function saoPauloToday(now = new Date()): { date: string; year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${year}-${pad(month)}-${pad(day)}`, year, month };
}

/** Primeiro instante do mês (offset fixo -03:00, sem horário de verão desde 2019). */
function monthStartSp(year: number, month: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${year}-${pad(month)}-01T00:00:00-03:00`);
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));
const numOrNull = (v: string | number | null | undefined) => (v == null ? null : Number(v));

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

export async function getCommandCenterData(tenantId: string): Promise<CommandCenterData> {
  const now = new Date();
  const today = saoPauloToday(now);
  const monthStart = monthStartSp(today.year, today.month);
  const prevMonthStart =
    today.month === 1 ? monthStartSp(today.year - 1, 12) : monthStartSp(today.year, today.month - 1);
  const since24h = new Date(now.getTime() - 24 * 3_600_000);

  const open = sql`${quotes.status} in ('enviado','em_negociacao','bloqueado_margem')`;
  const monthIso = monthStart.toISOString();
  const prevIso = prevMonthStart.toISOString();

  const [quoteAgg] = await db
    .select({
      openCount: sql<number>`count(*) filter (where ${open})`,
      openTotal: sql<string>`coalesce(sum(${quotes.totalAmount}) filter (where ${open}), 0)`,
      blockedCount: sql<number>`count(*) filter (where ${quotes.status} = 'bloqueado_margem')`,
      blockedTotal: sql<string>`coalesce(sum(${quotes.totalAmount}) filter (where ${quotes.status} = 'bloqueado_margem'), 0)`,
      approvedMonthCount: sql<number>`count(*) filter (where ${quotes.status} = 'aprovado' and ${quotes.updatedAt} >= ${monthIso}::timestamptz)`,
      marginMonth: sql<string | null>`avg(${quotes.grossMarginPct}) filter (where ${quotes.status} = 'aprovado' and ${quotes.updatedAt} >= ${monthIso}::timestamptz)`,
      marginPrev: sql<string | null>`avg(${quotes.grossMarginPct}) filter (where ${quotes.status} = 'aprovado' and ${quotes.updatedAt} >= ${prevIso}::timestamptz and ${quotes.updatedAt} < ${monthIso}::timestamptz)`,
    })
    .from(quotes)
    .where(eq(quotes.tenantId, tenantId));

  const pendingRows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      tradeName: customers.tradeName,
      legalName: customers.legalName,
      seller: users.name,
      totalAmount: quotes.totalAmount,
      marginPct: quotes.grossMarginPct,
      minMarginPct: quotes.minMarginPct,
    })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .innerJoin(users, eq(users.id, quotes.sellerId))
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.status, "bloqueado_margem")))
    .orderBy(desc(quotes.totalAmount))
    .limit(5);

  const [resolved] = await db
    .select({ count: sql<number>`count(*)` })
    .from(quotes)
    .where(
      and(
        eq(quotes.tenantId, tenantId),
        sql`${quotes.approvedAt} >= ${since24h.toISOString()}::timestamptz`
      )
    );

  const stockKpis = await getStockKpis(tenantId);
  const stockRows = await db
    .select({
      sku: products.sku,
      description: products.commercialDescription,
      status: stockPredictiveMetrics.predictiveStatus,
      coverageDays: stockPredictiveMetrics.coverageDays,
      leadTimeDays: stockPredictiveMetrics.leadTimeDays,
      suggestedQty: stockPredictiveMetrics.suggestedPurchaseQty,
      cost: products.replacementCostBase,
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
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(
      and(
        eq(stockPredictiveMetrics.tenantId, tenantId),
        inArray(stockPredictiveMetrics.predictiveStatus, ["CRITICAL_RUPTURE", "WARNING"])
      )
    )
    .orderBy(stockPredictiveMetrics.coverageDays);
  const criticalRows = stockRows.filter((r) => r.status === "CRITICAL_RUPTURE");
  const warningCount = stockRows.length - criticalRows.length;

  const marketQuotes = await getQuotes();
  const bySymbol = new Map(marketQuotes.map((q) => [q.symbol, q]));
  const ptax = bySymbol.get(ASSET_SYMBOLS.PTAX) ?? null;
  const aluminium = bySymbol.get(ASSET_SYMBOLS.LME_ALU) ?? null;
  const hrc = bySymbol.get(ASSET_SYMBOLS.HRC_US) ?? null;

  const [{ count: parityCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(importParityConfigs)
    .where(eq(importParityConfigs.tenantId, tenantId));
  const parityConfigsCount = Number(parityCount ?? 0);
  const importSpreadPct = parityConfigsCount > 0 ? await currentSpreadPct(tenantId) : null;

  const topVolatility = Math.max(Math.abs(aluminium?.change7d ?? 0), Math.abs(hrc?.change7d ?? 0));
  const proposalValidityLabel =
    aluminium || hrc ? computeQuoteValidity(topVolatility, now).label : null;

  const [briefingRow] = await db
    .select()
    .from(dailyBriefings)
    .where(eq(dailyBriefings.tenantId, tenantId))
    .orderBy(desc(dailyBriefings.briefingDate), desc(dailyBriefings.createdAt))
    .limit(1);

  const blockedCount = Number(quoteAgg?.blockedCount ?? 0);
  const blockedTotal = num(quoteAgg?.blockedTotal);
  const marginMonthPct = numOrNull(quoteAgg?.marginMonth);
  const marginPrevMonthPct = numOrNull(quoteAgg?.marginPrev);

  // --- Matriz de riscos: cada linha descreve o que o sistema mede hoje ---
  const risks: RiskRow[] = [];

  const topSkus = criticalRows
    .slice(0, 3)
    .map((r) => r.sku)
    .join(", ");
  risks.push({
    key: "estoque",
    title: "Estoque Siderúrgico",
    level: stockLevel(criticalRows.length, warningCount),
    badge:
      criticalRows.length > 0
        ? `Risco alto (${criticalRows.length} SKU${criticalRows.length > 1 ? "s" : ""})`
        : warningCount > 0
          ? `Atenção (${warningCount} SKU${warningCount > 1 ? "s" : ""})`
          : "Sem ruptura prevista",
    text:
      criticalRows.length > 0
        ? `Cobertura abaixo do lead time em ${topSkus}${criticalRows.length > 3 ? " e outros" : ""}.`
        : warningCount > 0
          ? "SKUs entre 1,0x e 1,3x do lead time (ponto de pedido atingido)."
          : "Nenhum SKU com cobertura abaixo do lead time.",
    next: { label: "Abrir matriz de ruptura", href: "/estoque" },
  });

  const marketRow = (key: string, title: string, q: Quote | null): RiskRow => ({
    key,
    title,
    level: q ? volatilityLevel(q.change7d) : "nodata",
    badge: q?.change7d != null ? `${pct(q.change7d)} em 7d` : "Sem série",
    text:
      q?.change7d != null
        ? `Variação semanal do índice ${q.symbol}.${proposalValidityLabel ? ` Validade das novas propostas: ${proposalValidityLabel}.` : ""}`
        : "Sem cotação ingerida para este índice.",
    next: { label: "Abrir terminal de mercado", href: "/mercado" },
  });
  risks.push(marketRow("aluminio", "Mercado & LME Alumínio", aluminium));
  risks.push(marketRow("aco", "Mercado & HRC (aço)", hrc));

  risks.push({
    key: "propostas",
    title: "Propostas & Margem",
    level: quotesLevel(blockedCount),
    badge: blockedCount > 0 ? `${blockedCount} bloqueada${blockedCount > 1 ? "s" : ""}` : "Sem bloqueios",
    text:
      blockedCount > 0
        ? `${brl(blockedTotal)} em propostas aguardando liberação do diretor por margem ou custo de reposição.`
        : "Nenhuma proposta travada por margem.",
    next: { label: "Ver propostas", href: "/vendas/orcamentos" },
  });

  risks.push({
    key: "capital",
    title: "Capital Parado",
    level: stockKpis.agedLotsCount > 0 ? "attention" : "ok",
    badge:
      stockKpis.agedLotsCount > 0
        ? `${stockKpis.agedLotsCount} lote${stockKpis.agedLotsCount > 1 ? "s" : ""} > 180d`
        : "Sem envelhecimento",
    text:
      stockKpis.agedLotsCount > 0
        ? `${brl(stockKpis.agedCapitalBrl)} em lotes ativos com entrada há mais de 180 dias.`
        : "Nenhum lote ativo com mais de 180 dias de entrada.",
    next: { label: "Abrir lotes", href: "/estoque?tab=lotes" },
  });

  risks.push({
    key: "cambio",
    title: "Câmbio PTAX",
    level: ptax ? "info" : "nodata",
    badge: ptax?.change7d != null ? `${pct(ptax.change7d)} em 7d` : "Sem série",
    text: ptax?.last != null ? `PTAX em R$ ${ptax.last.toFixed(4).replace(".", ",")}.` : "Sem cotação do BCB.",
    next: { label: "Abrir paridade de importação", href: "/mercado?tab=paridade" },
  });

  const thermometer: ThermometerItem[] = [
    { department: "Compras", level: "nodata", label: "Sem módulo" },
    {
      department: "Vendas",
      level: quotesLevel(blockedCount),
      label: blockedCount > 0 ? `${blockedCount} bloqueada${blockedCount > 1 ? "s" : ""}` : "OK",
    },
    {
      department: "Estoque",
      level: stockLevel(criticalRows.length, warningCount),
      label:
        criticalRows.length > 0
          ? `${criticalRows.length} crítico${criticalRows.length > 1 ? "s" : ""}`
          : warningCount > 0
            ? `${warningCount} em atenção`
            : "OK",
    },
    { department: "Chão de Fábrica", level: "nodata", label: "Sem módulo" },
    { department: "Financeiro", level: "nodata", label: "Sem módulo" },
  ];

  const globalLevel = worstLevel(risks.map((r) => r.level));

  // --- Recomendações: valor envolvido, mesma fórmula do KPI "déficit potencial" do M2 ---
  // Quantidade sugerida (unidade de estoque) → kg × R$/kg. Sem conversão conhecida, sem valor.
  const recs: Recommendation[] = criticalRows.slice(0, 10).map((r) => {
    const value = valueAtCostPerKg(r.suggestedQty, r.cost, r);
    return {
      id: `rep-${r.sku}`,
      department: "Estoque",
      action: `Repor ${r.sku}`,
      detail: `Cobertura ${num(r.coverageDays).toFixed(1).replace(".", ",")} d · lead time ${r.leadTimeDays} d`,
      amountBrl: value === null ? null : Number(value.toFixed(2)),
      href: "/estoque",
    };
  });
  for (const d of pendingRows) {
    recs.push({
      id: `qt-${d.id}`,
      department: "Vendas",
      action: `Decidir proposta #${d.quoteNumber}`,
      detail: `Margem ${num(d.marginPct).toFixed(1).replace(".", ",")}% · mínima ${num(d.minMarginPct).toFixed(1).replace(".", ",")}%`,
      amountBrl: num(d.totalAmount),
      href: `/vendas/orcamentos/${d.id}`,
    });
  }
  if (stockKpis.agedLotsCount > 0) {
    recs.push({
      id: "aged",
      department: "Estoque",
      action: `Girar ${stockKpis.agedLotsCount} lote${stockKpis.agedLotsCount > 1 ? "s" : ""} parado${stockKpis.agedLotsCount > 1 ? "s" : ""}`,
      detail: "Entrada há mais de 180 dias",
      amountBrl: stockKpis.agedCapitalBrl,
      href: "/estoque?tab=lotes",
    });
  }

  return {
    todayInSaoPaulo: today.date,
    quotes: {
      openCount: Number(quoteAgg?.openCount ?? 0),
      openTotal: num(quoteAgg?.openTotal),
      blockedCount,
      blockedTotal,
      approvedMonthCount: Number(quoteAgg?.approvedMonthCount ?? 0),
      marginMonthPct,
      marginPrevMonthPct,
      marginDeltaPp: marginDeltaPp(marginMonthPct, marginPrevMonthPct),
    },
    stock: { ...stockKpis, warningCount },
    market: { ptax, aluminium, hrc, importSpreadPct, parityConfigsCount, proposalValidityLabel },
    decisions: {
      pending: pendingRows.map((d) => ({
        id: d.id,
        quoteNumber: d.quoteNumber,
        customer: d.tradeName || d.legalName,
        seller: d.seller,
        totalAmount: num(d.totalAmount),
        marginPct: num(d.marginPct),
        minMarginPct: num(d.minMarginPct),
      })),
      resolvedLast24h: Number(resolved?.count ?? 0),
    },
    risks,
    thermometer,
    globalLevel,
    recommendations: rankRecommendations(recs, 8),
    briefing: briefingRow
      ? {
          id: briefingRow.id,
          briefingDate: briefingRow.briefingDate,
          summaryText: briefingRow.summaryText,
          createdAt: briefingRow.createdAt.toISOString(),
          sentViaEmailAt: briefingRow.sentViaEmailAt?.toISOString() ?? null,
          criticalRupturesCount: briefingRow.keyMetrics.criticalRupturesCount,
          pendingQuotesCount: briefingRow.keyMetrics.pendingQuotesCount,
        }
      : null,
  };
}
