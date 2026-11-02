import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { tenants, stockPredictiveMetrics, products, quotes, marketAssets, marketPriceSeries } from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { dailyBriefings } from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/email/resend";

export async function generateDailyBriefing(tenantId: string) {
  const startedAt = Date.now();

  // 1. Rupturas críticas
  const ruptures = await db
    .select({ sku: products.sku, desc: products.commercialDescription, coverage: stockPredictiveMetrics.coverageDays, status: stockPredictiveMetrics.predictiveStatus })
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(and(eq(stockPredictiveMetrics.tenantId, tenantId), sql`${stockPredictiveMetrics.predictiveStatus} IN ('CRITICAL_RUPTURE','WARNING')`))
    .orderBy(stockPredictiveMetrics.coverageDays)
    .limit(20);

  // 2. Propostas pendentes
  const pendingQuotes = await db
    .select({ count: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${quotes.totalAmount}::numeric),0)` })
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), sql`${quotes.status} in ('bloqueado_margem','enviado','em_negociacao')`));

  // 3. Mercado USD e LME
  const getLatest = async (symbol: string) => {
    const [a] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
    if (!a) return null;
    const [r] = await db.select({ close: marketPriceSeries.close, ts: marketPriceSeries.timestamp }).from(marketPriceSeries).where(eq(marketPriceSeries.assetId, a.id)).orderBy(desc(marketPriceSeries.timestamp)).limit(1);
    return r ? { value: Number(r.close), asOf: r.ts.toISOString() } : null;
  };
  const usd = await getLatest("USD_BRL");
  const lme = await getLatest("LME_ALU");

  const criticalRupturesCount = ruptures.filter((r) => r.status === "CRITICAL_RUPTURE").length;
  const pendingQuotesCount = Number(pendingQuotes[0]?.count ?? 0);
  const potentialLossAmount = Number(pendingQuotes[0]?.total ?? 0);

  const dataContext = {
    rupturas: ruptures.map((r) => ({ sku: r.sku, descricao: r.desc, diasCobertura: Number(r.coverage), status: r.status })),
    propostasPendentes: { count: pendingQuotesCount, valorTotal: potentialLossAmount },
    mercado: { usd: usd?.value, lmeAlu: lme?.value },
  };

  const prompt = `Você é o Copiloto Executivo do MetalAgents, sistema de inteligência industrial para distribuidora de aço/metal.
Gere um briefing matinal executivo em PT-BR, objetivo e sem alucinações, baseado EXCLUSIVAMENTE nos dados abaixo (JSON).
Estruture em 3 seções com títulos exatos:
⚠️ Atenção Imediata (Rupturas & Atrasos)
📈 Oportunidades de Compra & Mercado
💼 Propostas Comerciais Estratégicas
Para cada item, cite SKU/valores exatos dos dados. Não invente números.

DADOS:
${JSON.stringify(dataContext, null, 2)}`;

  let summaryText = "";
  let summaryHtml = "";
  try {
    const { text } = await generateText({
      model: openai(process.env.OPENAI_MODEL || "gpt-4o-mini"),
      prompt,
    });
    summaryText = text;
    summaryHtml = text.replace(/\n/g, "<br/>");
  } catch (err) {
    summaryText = "Briefing indisponível: " + (err instanceof Error ? err.message : String(err));
    summaryHtml = summaryText;
  }

  const recommendedActions = ruptures.slice(0, 5).map((r) => ({
    department: "Estoque",
    action: `Repor ${r.sku} (${r.desc})`,
    financialImpact: `Cobertura ${Number(r.coverage).toFixed(1)} dias`,
    priority: (r.status === "CRITICAL_RUPTURE" ? "alta" : "media") as "alta" | "media" | "baixa",
  }));

  const briefingDate = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(dailyBriefings)
    .values({
      tenantId,
      briefingDate,
      summaryHtml,
      summaryText,
      keyMetrics: {
        criticalRupturesCount,
        pendingQuotesCount,
        potentialLossAmount,
        usdRate: usd?.value ?? 0,
        lmeAluRate: lme?.value ?? 0,
      },
      recommendedActions,
    })
    .returning();

  // Envia e-mail para diretoria (best-effort) via resend direct
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const directors = await db.select({ email: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
      // placeholder: envio não bloqueante; log
      console.log("[briefing] gerado para tenant", tenantId, "ms", Date.now() - startedAt);
    }
  } catch {
    // ignore
  }

  return row;
}

export async function generateDailyBriefingAllTenants() {
  const all = await db.select({ id: tenants.id }).from(tenants);
  const results = [];
  for (const t of all) {
    try {
      results.push(await generateDailyBriefing(t.id));
    } catch (e) {
      console.error("[briefing] tenant", t.id, e);
    }
  }
  return results;
}