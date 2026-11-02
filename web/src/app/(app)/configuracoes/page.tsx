import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries } from "@/lib/db/schema";
import { checkPermission } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs } from "@/components/ui/tabs";
import { MarketSettings } from "@/components/features/settings/market-settings";
import { getMetalsCron } from "@/lib/market/schedule";
import { isCommodityPriceApiConfigured, isMetalsApiConfigured } from "@/lib/market/ingest-metals";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  if (!(await checkPermission("usuarios_sistema", "read"))) {
    return <Forbidden module="Configuração" />;
  }
  const canWrite = await checkPermission("usuarios_sistema", "write");

  const rows = await db
    .select({
      id: marketAssets.id,
      symbol: marketAssets.symbol,
      name: marketAssets.name,
      market: marketAssets.market,
      baseCurrency: marketAssets.baseCurrency,
      unit: marketAssets.unit,
      provider: marketAssets.provider,
      providerSymbol: marketAssets.providerSymbol,
      active: marketAssets.active,
      points: sql<number>`count(${marketPriceSeries.id})::int`,
      lastAt: sql<Date | null>`max(${marketPriceSeries.timestamp})`,
    })
    .from(marketAssets)
    .leftJoin(marketPriceSeries, eq(marketPriceSeries.assetId, marketAssets.id))
    .groupBy(marketAssets.id)
    .orderBy(asc(marketAssets.createdAt));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Configuração", href: "/configuracoes" },
          { label: "Mercado" },
        ]}
      />
      <PageHeader
        title="Configuração"
        description="Parâmetros do sistema · fontes de dados e automações"
      />
      <Tabs
        active="mercado"
        items={[{ key: "mercado", label: "Mercado", href: "/configuracoes?tab=mercado" }]}
      />
      <MarketSettings
        canWrite={canWrite}
        metalsCron={getMetalsCron()}
        keys={{ metals: isMetalsApiConfigured(), commodity: isCommodityPriceApiConfigured() }}
        assets={rows.map((r) => ({
          ...r,
          lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
        }))}
      />
    </div>
  );
}
