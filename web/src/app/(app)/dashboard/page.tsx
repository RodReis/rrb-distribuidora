import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { getCommandCenterData } from "@/lib/dashboard/command-center";
import { isBriefingFromToday, splitBriefingSections } from "@/lib/dashboard/insights";
import { BriefingPanel } from "@/components/features/dashboard/briefing-panel";
import { CopilotTerminal } from "@/components/features/dashboard/copilot-launchers";
import {
  CommandHeader,
  DecisionQueue,
  KpiGrid,
  RecommendationsTable,
  RiskMatrix,
  Thermometer,
} from "@/components/features/dashboard/command-center-sections";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!(await checkPermission("visao_geral", "read"))) {
    return <Forbidden module="Visão Geral" />;
  }

  const data = await getCommandCenterData(user.tenantId);
  const sections = data.briefing ? splitBriefingSections(data.briefing.summaryText) : [];
  const canApprove = user.role === "diretor" || user.role === "admin";

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <Breadcrumbs items={[{ label: "Início", href: "/dashboard" }, { label: "Command Center" }]} />

      <CommandHeader data={data} user={user} />

      <BriefingPanel
        briefing={data.briefing}
        sections={sections}
        isToday={
          data.briefing
            ? isBriefingFromToday(data.briefing.briefingDate, data.todayInSaoPaulo)
            : false
        }
      />

      <KpiGrid data={data} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <DecisionQueue data={data} canApprove={canApprove} />
        <RiskMatrix data={data} />
      </div>

      <Thermometer data={data} />
      <RecommendationsTable data={data} />
      <CopilotTerminal />
    </div>
  );
}
