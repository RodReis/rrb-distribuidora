import Link from "next/link";
import { ChevronRight, ChevronLeft, MessageSquareOff, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { AuditFilters } from "@/lib/governance/filters";
import type { getAuditPage, getAuditSummary } from "@/lib/governance/audit-query";
import { AuditFiltersBar } from "./audit-filters";

type Summary = Awaited<ReturnType<typeof getAuditSummary>>;
type Page = Awaited<ReturnType<typeof getAuditPage>>;
type ToolRun = { toolName: string; params: Record<string, unknown>; resultSummary: string };

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

const nf = (n: number) => n.toLocaleString("pt-BR");

function pageHref(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams({ tab: "auditoria" });
  if (filters.q) params.set("q", filters.q);
  if (filters.agent) params.set("agente", filters.agent);
  if (filters.feedback !== "todos") params.set("feedback", filters.feedback);
  if (filters.size !== 25) params.set("size", String(filters.size));
  if (page > 1) params.set("page", String(page));
  return `/governanca?${params.toString()}`;
}

function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length === 0
    ? "sem filtros"
    : entries.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

export function AuditSummaryStrip({ summary }: { summary: Summary }) {
  const rated = summary.positive + summary.negative;
  const cells = [
    {
      label: "Interações registradas",
      value: nf(summary.total),
      sub: summary.lastAt ? `Última: ${formatDateTime(summary.lastAt)}` : "Nenhuma ainda",
    },
    {
      label: "Latência média",
      value: summary.avgLatencyMs != null ? `${nf(summary.avgLatencyMs)} ms` : "—",
      sub: "Por resposta do Copiloto",
    },
    {
      label: "Tokens consumidos",
      value: nf(summary.tokens),
      sub: "Entrada + saída, todas as respostas",
    },
    {
      label: "Avaliação dos usuários",
      value: rated > 0 ? `${Math.round((summary.positive / rated) * 100)}% úteis` : "—",
      sub: rated > 0 ? `${summary.positive} úteis · ${summary.negative} não úteis` : "Sem avaliações",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-carbon-800 bg-carbon-950 p-3 md:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="space-y-0.5">
          <span className="block text-label-caps font-semibold uppercase text-titanium-steel">{c.label}</span>
          <span className="block font-mono text-metric-regular text-ice-white">{c.value}</span>
          <span className="block font-mono text-label-code text-titanium-muted">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function AuditTrail({
  filters,
  page,
}: {
  filters: AuditFilters;
  page: Page;
}) {
  const hasFilters = !!(filters.q || filters.agent || filters.feedback !== "todos");
  const from = page.total === 0 ? 0 : (page.page - 1) * filters.size + 1;
  const to = Math.min(page.page * filters.size, page.total);

  return (
    <div className="space-y-3">
      <AuditFiltersBar filters={filters} agents={page.agents} />

      {page.rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Nenhuma interação para os filtros" : "Nenhuma interação registrada"}
          description={
            hasFilters
              ? "Ajuste ou limpe os filtros para ver outras interações."
              : "Toda pergunta feita ao Copiloto aparece aqui automaticamente, com as ferramentas consultadas."
          }
          icon={<MessageSquareOff className="h-8 w-8 text-titanium-steel" />}
        />
      ) : (
        <div className="overflow-hidden rounded border border-carbon-800 bg-carbon-900">
          <div className="hidden grid-cols-[11rem_9rem_8rem_1fr_6rem_6rem_2rem] gap-3 border-b border-carbon-800 bg-carbon-950 px-3 py-2.5 text-label-caps font-semibold uppercase tracking-wider text-titanium-muted lg:grid">
            <span>Data / hora</span>
            <span>Usuário</span>
            <span>Agente</span>
            <span>Pergunta</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Latência</span>
            <span />
          </div>

          <ul className="divide-y divide-carbon-800/60">
            {page.rows.map((row, idx) => {
              const tools = (row.toolsExecuted as ToolRun[] | null) ?? [];
              const tokens = (row.promptTokens ?? 0) + (row.completionTokens ?? 0);
              return (
                <li key={row.id}>
                  <details className="group">
                    <summary
                      className={cn(
                        "grid cursor-pointer list-none grid-cols-1 gap-1 px-3 py-2.5 transition-colors hover:bg-carbon-800/40 lg:grid-cols-[11rem_9rem_8rem_1fr_6rem_6rem_2rem] lg:items-start lg:gap-3 [&::-webkit-details-marker]:hidden",
                        idx % 2 === 0 ? "bg-carbon-900/50" : "bg-carbon-950/40"
                      )}
                    >
                      <span className="font-mono text-label-code text-titanium-light">
                        {formatDateTime(row.createdAt)}
                      </span>
                      <span
                        title={row.userName ? undefined : "Execução automática, sem usuário"}
                        className={cn(
                          "truncate text-body-sm",
                          row.userName ? "text-ice-white" : "text-titanium-light"
                        )}
                      >
                        {row.userName ?? "Sistema"}
                      </span>
                      <span>
                        <span className="rounded border border-carbon-800 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-light">
                          {row.agentName}
                        </span>
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate text-body-sm text-titanium-light">
                          {row.userPrompt || "—"}
                        </span>
                        {tools.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            {tools.map((t, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded border border-carbon-700 bg-carbon-950 px-1.5 py-0.5 font-mono text-label-code text-tertiary"
                              >
                                <Wrench className="h-3 w-3" />
                                {t.toolName}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-label-code text-titanium-light lg:text-right">
                        {tokens > 0 ? nf(tokens) : "—"}
                      </span>
                      <span className="font-mono text-label-code text-titanium-light lg:text-right">
                        {row.latencyMs != null ? `${nf(row.latencyMs)} ms` : "—"}
                      </span>
                      <span className="flex items-center justify-end gap-1 text-titanium-muted">
                        {row.feedbackScore === 1 && <ThumbsUp className="h-3.5 w-3.5 text-signal-buy" />}
                        {row.feedbackScore === -1 && <ThumbsDown className="h-3.5 w-3.5 text-carmine-signal" />}
                        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                      </span>
                    </summary>

                    <div className="space-y-3 border-t border-carbon-800 bg-carbon-950 px-4 py-3">
                      <div>
                        <span className="mb-1 block font-mono text-label-code uppercase text-titanium-dark">
                          Pergunta
                        </span>
                        <p className="whitespace-pre-wrap text-body-sm text-ice-white">{row.userPrompt || "—"}</p>
                      </div>
                      {tools.length > 0 && (
                        <div>
                          <span className="mb-1 block font-mono text-label-code uppercase text-titanium-dark">
                            Ferramentas e parâmetros
                          </span>
                          <ul className="space-y-1.5">
                            {tools.map((t, i) => (
                              <li key={i} className="rounded border border-carbon-800 bg-carbon-900 p-2">
                                <span className="font-mono text-label-code font-semibold text-tertiary">
                                  {t.toolName}
                                </span>
                                <span className="ml-2 font-mono text-label-code text-titanium-muted">
                                  {formatParams(t.params)}
                                </span>
                                {t.resultSummary && (
                                  <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-label-code text-titanium-muted">
                                    {t.resultSummary}
                                  </pre>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <span className="mb-1 block font-mono text-label-code uppercase text-titanium-dark">
                          Resposta
                        </span>
                        <p className="whitespace-pre-wrap text-body-sm text-titanium-light">{row.agentResponse}</p>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col items-start justify-between gap-2 border-t border-carbon-800 bg-carbon-950 px-4 py-2.5 font-mono text-label-code text-titanium-muted sm:flex-row sm:items-center">
            <span>
              Exibindo <span className="text-ice-white">{from}–{to}</span> de{" "}
              <span className="text-ice-white">{nf(page.total)}</span> interações
            </span>
            <nav className="flex items-center gap-2" aria-label="Paginação">
              {page.page > 1 ? (
                <Link
                  href={pageHref(filters, page.page - 1)}
                  className="inline-flex items-center gap-1 rounded border border-carbon-700 px-2 py-1 text-titanium-light transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </Link>
              ) : null}
              <span>
                Página <span className="text-ice-white">{page.page}</span> de {page.pages}
              </span>
              {page.page < page.pages ? (
                <Link
                  href={pageHref(filters, page.page + 1)}
                  className="inline-flex items-center gap-1 rounded border border-carbon-700 px-2 py-1 text-titanium-light transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                >
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
