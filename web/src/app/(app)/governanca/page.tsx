import { getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PoliciesTab } from "@/components/features/governance/policies-tab";
import { AuditSummaryStrip, AuditTrail } from "@/components/features/governance/audit-trail";
import { getAuditPage, getAuditSummary } from "@/lib/governance/audit-query";
import { parseAuditFilters } from "@/lib/governance/filters";

export const dynamic = "force-dynamic";

export default async function GovernancaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const params = (searchParams ? await searchParams : {}) ?? {};

  // A trilha mostra a pergunta de todos os usuários: só admin e diretor (mesma regra de /admin/auditoria).
  const canSeeTrail = user.role === "admin" || user.role === "diretor";
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const active = canSeeTrail && requested === "auditoria" ? "auditoria" : "politicas";

  const tabs: TabItem[] = [{ key: "politicas", label: "Políticas", href: "/governanca?tab=politicas" }];

  let trail: React.ReactNode = null;
  if (canSeeTrail) {
    const summary = await getAuditSummary(user.tenantId);
    tabs.push({
      key: "auditoria",
      label: "Trilha de Auditoria de IA",
      href: "/governanca?tab=auditoria",
      count: summary.total,
    });

    if (active === "auditoria") {
      const filters = parseAuditFilters(params);
      const page = await getAuditPage(user.tenantId, filters);
      trail = (
        <div className="space-y-3">
          <AuditSummaryStrip summary={summary} />
          <AuditTrail filters={filters} page={page} />
        </div>
      );
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/dashboard" },
          { label: "Governança & Admin" },
          { label: "Governança de IA" },
        ]}
      />

      <PageHeader
        title="Governança de IA & Auditoria"
        description="Como o Copiloto e o briefing operam, o que eles podem consultar e o registro de cada interação."
        badge={
          <span className="rounded border border-carbon-700 bg-carbon-900 px-2 py-0.5 font-mono text-label-code uppercase text-signal-hold">
            Human-in-the-loop
          </span>
        }
      />

      {tabs.length > 1 && <Tabs items={tabs} active={active} />}

      {active === "auditoria" ? trail : <PoliciesTab />}
    </div>
  );
}
