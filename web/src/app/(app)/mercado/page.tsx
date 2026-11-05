import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  importParityConfigs,
  marketAlertRules,
  marketAssets,
  products,
  tenantMarketPriceSeries,
} from "@/lib/db/schema";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "@/components/ui/tabs";
import { MarketTerminal } from "@/components/features/market/market-terminal";
import { PaidPricePanel } from "@/components/features/market/paid-price-panel";
import { ParitySimulator } from "@/components/features/market/parity-simulator";
import { AlertsPanel } from "@/components/features/market/alerts-panel";
import { MarketAnalyses } from "@/components/features/market/market-analyses";
import { MarketSignals } from "@/components/features/market/market-signals";
import { ASSET_SYMBOLS } from "@/lib/market/assets";
import { getQuotes } from "@/lib/market/queries";
import { hasMarketCapability } from "@/lib/market/capabilities";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "terminal", label: "Terminal de Mercado" },
  { key: "paridade", label: "Paridade de Importação" },
  { key: "alertas", label: "Alertas" },
  { key: "preco-pago", label: "Preço pago" },
  { key: "analises", label: "Análises" },
  { key: "sinais", label: "Sinais" },
  { key: "noticias", label: "Notícias" },
] as const;

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!(await checkPermission("inteligencia_mercado", "read"))) {
    return <Forbidden module="Inteligência & LME" />;
  }
  const canWrite = await checkPermission("inteligencia_mercado", "write");

  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "terminal";

  const [quotes, configs, rules, assets, paidProducts, analysisAssets] = await Promise.all([
    getQuotes(user.tenantId),
    db
      .select()
      .from(importParityConfigs)
      .where(eq(importParityConfigs.tenantId, user.tenantId))
      .orderBy(desc(importParityConfigs.updatedAt)),
    db
      .select({
        id: marketAlertRules.id,
        assetId: marketAlertRules.assetId,
        assetName: marketAssets.name,
        assetSymbol: marketAssets.symbol,
        conditionType: marketAlertRules.conditionType,
        thresholdValue: marketAlertRules.thresholdValue,
        channels: marketAlertRules.channels,
        active: marketAlertRules.active,
        lastTriggeredAt: marketAlertRules.lastTriggeredAt,
      })
      .from(marketAlertRules)
      .innerJoin(marketAssets, eq(marketAssets.id, marketAlertRules.assetId))
      .where(eq(marketAlertRules.tenantId, user.tenantId))
      .orderBy(desc(marketAlertRules.createdAt)),
    db.select().from(marketAssets).where(eq(marketAssets.active, true)),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.commercialDescription,
        unit: products.unit,
      })
      .from(products)
      .where(eq(products.tenantId, user.tenantId)),
    db
      .selectDistinct({ symbol: marketAssets.symbol, name: marketAssets.name })
      .from(tenantMarketPriceSeries)
      .innerJoin(marketAssets, eq(marketAssets.id, tenantMarketPriceSeries.assetId))
      .where(
        and(eq(tenantMarketPriceSeries.tenantId, user.tenantId), eq(marketAssets.active, true))
      ),
  ]);

  const last = (symbol: string) => quotes.find((q) => q.symbol === symbol)?.last ?? null;
  const activeLabel = TABS.find((t) => t.key === active)!.label;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Inteligência & LME", href: "/mercado" },
          { label: activeLabel },
        ]}
      />
      <PageHeader
        title="Inteligência de Mercado & Preços"
        description="Terminal de commodities e arbitragem siderúrgica · LME · CME · BCB PTAX"
      />
      <Tabs
        active={active}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: `/mercado?tab=${t.key}`,
          count: t.key === "alertas" ? rules.length : undefined,
        }))}
      />

      {active === "terminal" && <MarketTerminal initialQuotes={quotes} canWrite={canWrite} />}
      {active === "preco-pago" && <PaidPricePanel products={paidProducts} />}
      {active === "analises" && <MarketAnalyses assets={analysisAssets} />}
      {active === "sinais" && <MarketSignals />}
      {active === "noticias" && (
        <div className="rounded-lg border border-carbon-700 bg-carbon-900 p-6 text-sm text-carbon-300">
          Notícias e regulação aguardam fontes e revisão.{" "}
          <a className="text-amber-400 underline" href="/mercado/noticias">
            Ver status
          </a>
        </div>
      )}
      {active === "paridade" && (
        <ParitySimulator
          defaultPtax={last(ASSET_SYMBOLS.PTAX)}
          defaultFob={last(ASSET_SYMBOLS.HRC_CN)}
          canWrite={canWrite}
          initialConfigs={configs}
        />
      )}
      {active === "alertas" && (
        <AlertsPanel
          canWrite={canWrite && hasMarketCapability(user.role, "market.alert.configure")}
          assets={assets.map((a) => ({ id: a.id, name: a.name }))}
          initialRules={rules.map((r) => ({
            ...r,
            lastTriggeredAt: r.lastTriggeredAt ? r.lastTriggeredAt.toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
