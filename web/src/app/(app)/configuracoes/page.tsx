import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketAssets, marketPriceSeries } from "@/lib/db/schema";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { MarketSettings } from "@/components/features/settings/market-settings";
import { AiSettings } from "@/components/features/settings/ai-settings";
import { getMetalsCron } from "@/lib/market/schedule";
import { isCommodityPriceApiConfigured, isMetalsApiConfigured } from "@/lib/market/ingest-metals";
import { isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { getTenantAiConfig } from "@/lib/ai/tenant-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  if (!(await checkPermission("usuarios_sistema", "read"))) {
    return <Forbidden module="Configuração" />;
  }
  const canWrite = await checkPermission("usuarios_sistema", "write");
  const user = await getCurrentUser();
  const params = (searchParams ? await searchParams : {}) ?? {};
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const active = requested === "ia" ? "ia" : "mercado";

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

  // Estado da IA do tenant. A chave nunca sai do servidor; a UI vê só os 4 últimos caracteres.
  let aiState: {
    default: { provider: string; model: string } | null;
    credentials: { provider: string; last4: string }[];
  } = { default: null, credentials: [] };
  try {
    const config = await getTenantAiConfig(user.tenantId);
    aiState = {
      default: config.default,
      credentials: Object.entries(config.credentials).map(([provider, credential]) => ({
        provider,
        last4: credential.last4,
      })),
    };
  } catch {
    // Sem credenciais (ou sem APP_ENCRYPTION_KEY): a tela mostra o aviso e o estado vazio.
  }

  const tabs: TabItem[] = [
    { key: "mercado", label: "Mercado", href: "/configuracoes?tab=mercado" },
    { key: "ia", label: "Inteligência Artificial", href: "/configuracoes?tab=ia" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Configuração", href: "/configuracoes" },
          { label: active === "ia" ? "Inteligência Artificial" : "Mercado" },
        ]}
      />
      <PageHeader
        title="Configuração"
        description="Parâmetros do sistema · fontes de dados, automações e IA"
      />
      <Tabs items={tabs} active={active} />

      {active === "ia" ? (
        <AiSettings
          canWrite={canWrite}
          encryptionOk={isEncryptionConfigured()}
          defaultModel={aiState.default}
          credentials={aiState.credentials}
        />
      ) : (
        <MarketSettings
          canWrite={canWrite}
          metalsCron={getMetalsCron()}
          keys={{ metals: isMetalsApiConfigured(), commodity: isCommodityPriceApiConfigured() }}
          assets={rows.map((r) => ({
            ...r,
            lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
