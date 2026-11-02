import { getCurrentUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { quotes, stockPredictiveMetrics, marketAssets, marketPriceSeries, dailyBriefings } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const tenantId = user.tenantId;

  const [openQuotes] = await db
    .select({ count: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${quotes.totalAmount}::numeric),0)` })
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), sql`${quotes.status} in ('enviado','em_negociacao','bloqueado_margem')`));

  const [margins] = await db
    .select({ avg: sql<string>`coalesce(avg(${quotes.grossMarginPct}::numeric),0)` })
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.status, "aprovado")));

  const [ruptures] = await db
    .select({ count: sql<number>`count(*)` })
    .from(stockPredictiveMetrics)
    .where(and(eq(stockPredictiveMetrics.tenantId, tenantId), sql`${stockPredictiveMetrics.predictiveStatus} = 'CRITICAL_RUPTURE'`));

  const [usdAsset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, "USD_BRL"));
  let usdRate: number | null = null;
  if (usdAsset) {
    const [r] = await db.select({ close: marketPriceSeries.close }).from(marketPriceSeries).where(eq(marketPriceSeries.assetId, usdAsset.id)).orderBy(desc(marketPriceSeries.timestamp)).limit(1);
    usdRate = r ? Number(r.close) : null;
  }

  const [briefing] = await db.select().from(dailyBriefings).where(eq(dailyBriefings.tenantId, tenantId)).orderBy(desc(dailyBriefings.createdAt)).limit(1);

  const criticalRuptures = Number(ruptures?.count ?? 0);
  const predictedRevenue = Number(openQuotes?.total ?? 0);
  const avgMargin = Number(margins?.avg ?? 0);

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: "#0b0d11", color: "#f8fafc" }}>
      <h1 className="text-2xl font-bold" style={{ color: "#f8fafc" }}>Command Center do Diretor</h1>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <KpiCard title="Faturamento Previsto (Propostas Abertas)" value={`R$ ${predictedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
        <KpiCard title="Margem Bruta Média (Aprovados)" value={`${avgMargin.toFixed(2)}%`} />
        <KpiCard title="SKUs em Ruptura Crítica" value={String(criticalRuptures)} />
        <KpiCard title="Dólar PTAX" value={usdRate != null ? usdRate.toFixed(4) : "—"} />
        <KpiCard title="Propostas Abertas" value={String(openQuotes?.count ?? 0)} />
      </div>

      {briefing && (
        <section className="rounded-lg border border-carbon-800 p-4 bg-carbon-900">
          <h2 className="text-lg font-semibold mb-2 text-ice-white">Briefing Matinal 07h</h2>
          <div className="text-sm text-ice-white whitespace-pre-wrap">{briefing.summaryText}</div>
        </section>
      )}

      <section className="rounded-lg border border-carbon-800 p-4 bg-carbon-900">
        <h2 className="text-lg font-semibold mb-2 text-ice-white">Termômetro Departamental</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          {["Compras", "Vendas", "Estoque", "Chão de Fábrica", "Financeiro"].map((d) => (
            <div key={d} className="rounded-md border border-carbon-800 p-2 text-center text-titanium-muted">{d}: OK</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-carbon-800 p-4 bg-carbon-900" style={{ backgroundColor: "#11141a", color: "#f8fafc" }}>
      <div className="text-xs" style={{ color: "#94a3b8" }}>{title}</div>
      <div className="text-xl font-bold mt-1" style={{ color: "#f8fafc" }}>{value}</div>
    </div>
  );
}