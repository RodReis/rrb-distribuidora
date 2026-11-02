import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { importParityConfigs, marketAlertRules, marketAssets } from "@/lib/db/schema";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "@/components/ui/tabs";
import { MarketTerminal } from "@/components/features/market/market-terminal";
import { ParitySimulator } from "@/components/features/market/parity-simulator";
import { AlertsPanel } from "@/components/features/market/alerts-panel";
import { ASSET_SYMBOLS } from "@/lib/market/assets";
import { getQuotes } from "@/lib/market/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "terminal", label: "Terminal de Mercado" },
  { key: "paridade", label: "Paridade de Importação" },
  { key: "alertas", label: "Alertas" },
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

  const [quotes, configs, rules, assets] = await Promise.all([
    getQuotes(),
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

      {active === "terminal" && <MarketTerminal initialQuotes={quotes} />}
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
          canWrite={canWrite}
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
