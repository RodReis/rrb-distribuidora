import { getCurrentUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { agentActions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GovernancaPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select({
      id: agentActions.id,
      agentName: agentActions.agentName,
      userPrompt: agentActions.userPrompt,
      agentResponse: agentActions.agentResponse,
      toolsExecuted: agentActions.toolsExecuted,
      promptTokens: agentActions.promptTokens,
      completionTokens: agentActions.completionTokens,
      latencyMs: agentActions.latencyMs,
      feedbackScore: agentActions.feedbackScore,
      createdAt: agentActions.createdAt,
      userName: users.name,
    })
    .from(agentActions)
    .leftJoin(users, eq(users.id, agentActions.userId))
    .where(eq(agentActions.tenantId, user.tenantId))
    .orderBy(desc(agentActions.createdAt))
    .limit(100);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Governança de IA & Auditoria</h1>
      <section className="rounded-lg border border-carbon-800 p-4 bg-carbon-900">
        <h2 className="text-lg font-semibold mb-2 text-ice-white">Políticas Ativas</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Human-in-the-loop: nenhuma ação autônoma de compra sem aprovação humana.</li>
          <li>Somente-leitura: o Copiloto não altera dados.</li>
          <li>LGPD: nenhum dado de cliente é utilizado para treinamento de modelos públicos.</li>
          <li>Proibido Text-to-SQL livre; acesso apenas via ferramentas auditadas.</li>
        </ul>
      </section>
      <section className="rounded-lg border border-carbon-800 p-4 bg-carbon-900">
        <h2 className="text-lg font-semibold mb-2 text-ice-white">Trilha de Auditoria de IA</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Data/Hora</th>
                <th className="p-2">Usuário</th>
                <th className="p-2">Agente</th>
                <th className="p-2">Prompt</th>
                <th className="p-2">Ferramentas</th>
                <th className="p-2">Tokens</th>
                <th className="p-2">Latência (ms)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="p-2 whitespace-nowrap">{r.createdAt.toISOString()}</td>
                  <td className="p-2">{r.userName}</td>
                  <td className="p-2">{r.agentName}</td>
                  <td className="p-2 max-w-xs truncate">{r.userPrompt}</td>
                  <td className="p-2">{(r.toolsExecuted as { toolName: string }[] | null)?.map((t) => t.toolName).join(", ")}</td>
                  <td className="p-2">{(r.promptTokens ?? 0) + (r.completionTokens ?? 0)}</td>
                  <td className="p-2">{r.latencyMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}