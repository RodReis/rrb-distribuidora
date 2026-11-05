import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { MarketSignals } from "@/components/features/market/market-signals";

export default async function SignalsPage() {
  await getCurrentUser();
  if (!(await checkPermission("inteligencia_mercado", "read")))
    return <Forbidden module="Inteligência & LME" />;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Inteligência & LME", href: "/mercado" },
          { label: "Sinais" },
        ]}
      />
      <PageHeader
        title="Sinais e backtesting"
        description="Modelos versionados e resultados rastreáveis"
      />
      <MarketSignals />
    </div>
  );
}
