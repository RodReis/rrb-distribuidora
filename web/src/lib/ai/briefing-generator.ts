import { generateText } from "ai";
import { copilotModel } from "@/lib/ai/copilot-config";
import {
  BRIEFING_AGENT_NAME,
  briefingFailureResponse,
  buildBriefingAuditEntry,
} from "@/lib/ai/briefing-audit";
import { db } from "@/lib/db";
import {
  tenants,
  users,
  stockPredictiveMetrics,
  products,
  quotes,
  marketAssets,
  marketPriceSeries,
  dailyBriefings,
  agentActions,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { sendBriefingEmail } from "@/lib/email/briefing";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import { MARKET_TIMEZONE } from "@/lib/market/schedule";

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MARKET_TIMEZONE }).format(new Date());
}

async function getLatest(symbol: string) {
  const [a] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
  if (!a) return null;
  const [r] = await db
    .select({ close: marketPriceSeries.close, ts: marketPriceSeries.timestamp })
    .from(marketPriceSeries)
    .where(eq(marketPriceSeries.assetId, a.id))
    .orderBy(desc(marketPriceSeries.timestamp))
    .limit(1);
  return r ? { value: Number(r.close), asOf: r.ts.toISOString() } : null;
}

/** Grava o briefing na trilha de IA. Falha da auditoria é logada e nunca derruba o briefing. */
async function logBriefingAudit(
  tenantId: string,
  audit: ReturnType<typeof buildBriefingAuditEntry>,
  response: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  latencyMs: number
) {
  try {
    await db.insert(agentActions).values({
      tenantId,
      userId: null,
      agentName: BRIEFING_AGENT_NAME,
      userPrompt: audit.userPrompt,
      toolsExecuted: audit.toolsExecuted,
      agentResponse: response,
      promptTokens: usage?.inputTokens ?? null,
      completionTokens: usage?.outputTokens ?? null,
      latencyMs,
    });
  } catch (e) {
    console.error("[briefing] falha ao gravar na trilha de IA", e);
  }
}

export async function generateDailyBriefing(tenantId: string) {
  const startedAt = Date.now();

  const ruptures = await db
    .select({
      sku: products.sku,
      desc: products.commercialDescription,
      coverage: stockPredictiveMetrics.coverageDays,
      status: stockPredictiveMetrics.predictiveStatus,
    })
    .from(stockPredictiveMetrics)
    .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
    .where(
      and(
        eq(stockPredictiveMetrics.tenantId, tenantId),
        sql`${stockPredictiveMetrics.predictiveStatus} IN ('CRITICAL_RUPTURE','WARNING')`
      )
    )
    .orderBy(stockPredictiveMetrics.coverageDays)
    .limit(20);

  const pendingQuotes = await db
    .select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${quotes.totalAmount}::numeric),0)`,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.tenantId, tenantId),
        sql`${quotes.status} in ('bloqueado_margem','enviado','em_negociacao')`
      )
    );

  const usd = await getLatest(ASSET_SYMBOLS.PTAX);
  const lme = await getLatest(ASSET_SYMBOLS.LME_ALU);

  const criticalRupturesCount = ruptures.filter((r) => r.status === "CRITICAL_RUPTURE").length;
  const pendingQuotesCount = Number(pendingQuotes[0]?.count ?? 0);
  const potentialLossAmount = Number(pendingQuotes[0]?.total ?? 0);

  const dataContext = {
    rupturas: ruptures.map((r) => ({
      sku: r.sku,
      descricao: r.desc,
      diasCobertura: Number(r.coverage),
      status: r.status,
    })),
    propostasPendentes: { count: pendingQuotesCount, valorTotal: potentialLossAmount },
    // Cada valor com a unidade no nome: sem isso o modelo assume reais e escreve "R$ 2.783" para o alumínio.
    mercado: {
      dolarPtaxReaisPorDolar: usd?.value ?? null,
      aluminioLmeDolaresPorTonelada: lme?.value ?? null,
    },
  };

  const prompt = `Você é o Copiloto Executivo do MetalAgents, sistema de inteligência industrial para distribuidora de aço/metal.
Gere um briefing matinal executivo em PT-BR, objetivo e sem alucinações, baseado EXCLUSIVAMENTE nos dados abaixo (JSON).
Estruture em 3 seções com títulos exatos:
⚠️ Atenção Imediata (Rupturas & Atrasos)
📈 Oportunidades de Compra & Mercado
💼 Propostas Comerciais Estratégicas
Para cada item, cite SKU/valores exatos dos dados. Não invente números. Quando um dado de mercado for nulo, diga que está indisponível.
Escreva números no padrão brasileiro: milhar com ponto e decimal com vírgula (1.234,56).
Respeite a unidade que está no nome de cada campo: valores em reais como R$ 1.234,56 e em dólares como US$ 1.234,56 (o alumínio da LME é em US$ por tonelada, nunca em reais).

DADOS:
${JSON.stringify(dataContext, null, 2)}`;

  const audit = buildBriefingAuditEntry({
    briefingDate: todayInSaoPaulo(),
    rupturesCount: ruptures.length,
    criticalCount: criticalRupturesCount,
    pendingQuotesCount,
    pendingQuotesTotal: potentialLossAmount,
    usdRate: usd?.value ?? null,
    lmeAluRate: lme?.value ?? null,
  });

  // Falha do LLM propaga: nunca grava texto de erro como se fosse briefing. A falha vai para a trilha.
  let summaryText: string;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    const result = await generateText({
      model: copilotModel(),
      prompt,
    });
    summaryText = result.text;
    usage = result.totalUsage;
  } catch (err) {
    await logBriefingAudit(
      tenantId,
      audit,
      briefingFailureResponse(err),
      undefined,
      Date.now() - startedAt
    );
    throw err;
  }
  await logBriefingAudit(tenantId, audit, summaryText, usage, Date.now() - startedAt);
  const summaryHtml = summaryText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  const recommendedActions = ruptures.slice(0, 5).map((r) => ({
    department: "Estoque",
    action: `Repor ${r.sku} (${r.desc})`,
    financialImpact: `Cobertura ${Number(r.coverage).toFixed(1)} dias`,
    priority: (r.status === "CRITICAL_RUPTURE" ? "alta" : "media") as "alta" | "media" | "baixa",
  }));

  const briefingDate = todayInSaoPaulo();
  const values = {
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
  };

  // Um briefing por tenant/dia: reexecução substitui o do dia.
  const [existing] = await db
    .select({ id: dailyBriefings.id })
    .from(dailyBriefings)
    .where(
      and(eq(dailyBriefings.tenantId, tenantId), eq(dailyBriefings.briefingDate, briefingDate))
    )
    .limit(1);

  const [row] = existing
    ? await db
        .update(dailyBriefings)
        .set({ ...values, sentViaEmailAt: null, createdAt: new Date() })
        .where(eq(dailyBriefings.id, existing.id))
        .returning()
    : await db
        .insert(dailyBriefings)
        .values({ tenantId, briefingDate, ...values })
        .returning();

  const directors = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "diretor"), eq(users.active, true)));

  const sent = await sendBriefingEmail(
    directors.map((d) => d.email),
    briefingDate,
    summaryText
  );
  if (sent) {
    await db
      .update(dailyBriefings)
      .set({ sentViaEmailAt: new Date() })
      .where(eq(dailyBriefings.id, row.id));
  }

  console.log(
    `[briefing] tenant ${tenantId} ${briefingDate} ${Date.now() - startedAt}ms email=${sent ? "enviado" : "nao-enviado"}`
  );
  return row;
}

export async function generateDailyBriefingAllTenants() {
  const all = await db.select({ id: tenants.id }).from(tenants);
  const results = [];
  const errors: string[] = [];
  for (const t of all) {
    try {
      results.push(await generateDailyBriefing(t.id));
    } catch (e) {
      console.error("[briefing] tenant", t.id, e);
      errors.push(`${t.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { results, errors };
}
