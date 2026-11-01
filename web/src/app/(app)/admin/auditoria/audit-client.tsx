"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { formatNumberBR } from "@/lib/utils";
import {
  FileText,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  Pencil,
  Search,
} from "lucide-react";

const ENTITY_LABELS: Record<string, string> = {
  products: "Produtos",
  suppliers: "Fornecedores",
  customers: "Clientes",
  warehouses: "Depósitos",
  machines: "Máquinas",
  users: "Usuários",
  import_jobs: "Importações",
};

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  insert: {
    label: "CRIAÇÃO",
    className: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
  },
  update: {
    label: "ALTERAÇÃO",
    className: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
  },
  delete: {
    label: "EXCLUSÃO",
    className: "border-signal-risk/40 bg-signal-risk/10 text-signal-risk",
  },
};

export function AuditClient({ initialEntries }: { initialEntries: any[] }) {
  const [entries, setEntries] = React.useState(initialEntries);
  const [search, setSearch] = React.useState("");
  const [entityFilter, setEntityFilter] = React.useState("todas");
  const [actionFilter, setActionFilter] = React.useState("todas");
  const [expanded, setExpanded] = React.useState<number | null>(null);

  React.useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const filtered = React.useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        search === "" ||
        (e.userName || "").toLowerCase().includes(search.toLowerCase()) ||
        e.entityId.toLowerCase().includes(search.toLowerCase()) ||
        (ENTITY_LABELS[e.entity] || e.entity).toLowerCase().includes(search.toLowerCase());
      const matchEntity = entityFilter === "todas" || e.entity === entityFilter;
      const matchAction = actionFilter === "todas" || e.action === actionFilter;
      return matchSearch && matchEntity && matchAction;
    });
  }, [entries, search, entityFilter, actionFilter]);

  function summarize(record: any): string {
    if (!record) return "—";
    if (record.sku) return String(record.sku);
    if (record.commercialDescription)
      return String(record.commercialDescription).slice(0, 60);
    if (record.legalName) return String(record.legalName);
    if (record.name) return String(record.name);
    if (record.email) return String(record.email);
    if (record.action === "password_reset") return "Reset de senha";
    return JSON.stringify(record).slice(0, 60);
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Governança & Admin" },
          { label: "Trilha de Auditoria (US-10)" },
        ]}
      />

      <PageHeader
        title="Trilha de Auditoria & Rastreabilidade Operacional"
        description="Registro imutável de toda escrita em cadastros — quem, quando, o quê, antes e depois (JSONB)"
        badge={
          <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-signal-buy px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> APPEND-ONLY
          </span>
        }
      />

      {/* Filters */}
      <div className="bg-carbon-900 border border-carbon-800 p-3 rounded flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-titanium-dark" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuário, entidade ou ID do registro..."
            className="w-full bg-carbon-950 text-body-sm pl-9 pr-3 py-1.5 rounded border border-carbon-700 text-ice-white placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
          />
        </div>
        <div className="w-44">
          <Select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-body-sm py-1"
          >
            <option value="todas">Entidade: Todas</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-body-sm py-1"
          >
            <option value="todas">Ação: Todas</option>
            <option value="insert">Criação</option>
            <option value="update">Alteração</option>
            <option value="delete">Exclusão</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-carbon-900 border border-carbon-800 rounded overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-950 border-b border-carbon-800 text-label-caps font-semibold text-titanium-muted tracking-wider uppercase select-none">
                <th className="py-2.5 px-2 w-8"></th>
                <th className="py-2.5 px-3 w-44">DATA / HORA</th>
                <th className="py-2.5 px-3 w-40">OPERADOR</th>
                <th className="py-2.5 px-3 w-32">ENTIDADE</th>
                <th className="py-2.5 px-3 w-28">AÇÃO</th>
                <th className="py-2.5 px-3">RESUMO DO REGISTRO</th>
                <th className="py-2.5 px-3 w-28 font-mono">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      title="Nenhum evento registrado"
                      description="Não há eventos de auditoria para os filtros selecionados. Toda criação/edição em cadastros aparece aqui automaticamente."
                      icon={<FileText className="w-8 h-8 text-titanium-steel" />}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((e, idx) => {
                  const action = ACTION_LABELS[e.action] || {
                    label: e.action.toUpperCase(),
                    className: "border-carbon-700 bg-carbon-800 text-titanium-muted",
                  };
                  const isOpen = expanded === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        className={`transition-colors cursor-pointer ${
                          isOpen
                            ? "bg-carbon-800/70"
                            : idx % 2 === 0
                            ? "bg-carbon-900/50 hover:bg-carbon-800/40"
                            : "bg-carbon-950/40 hover:bg-carbon-800/40"
                        }`}
                      >
                        <td className="py-2 px-2 align-top text-titanium-muted">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="py-2.5 px-3 align-top font-mono text-label-code text-titanium-light">
                          {new Date(e.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-3 align-top text-body-sm text-ice-white">
                          {e.userName || "sistema"}
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <span className="font-mono text-label-code bg-carbon-950 px-2 py-0.5 rounded border border-carbon-800 text-titanium-light">
                            {ENTITY_LABELS[e.entity] || e.entity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <span
                            className={`font-mono text-label-code px-2 py-0.5 rounded border ${action.className}`}
                          >
                            {e.action === "insert" ? "+" : e.action === "delete" ? "x" : "~"}{" "}
                            {action.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 align-top text-body-sm text-titanium-light">
                          {e.action === "insert"
                            ? summarize(e.after)
                            : e.action === "delete"
                            ? summarize(e.before)
                            : `${summarize(e.before)} → ${summarize(e.after)}`}
                        </td>
                        <td className="py-2.5 px-3 align-top font-mono text-label-code text-titanium-dark">
                          {String(e.entityId).slice(0, 8)}…
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-carbon-950">
                          <td colSpan={7} className="px-4 py-3 border-t border-carbon-800">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div>
                                <span className="font-mono text-label-code text-titanium-dark uppercase block mb-1.5">
                                  Estado Anterior (before)
                                </span>
                                <pre className="bg-carbon-900 border border-carbon-800 rounded p-3 font-mono text-label-code text-titanium-muted overflow-x-auto max-h-48">
{e.before ? JSON.stringify(e.before, null, 2) : "null (registro criado)"}
                                </pre>
                              </div>
                              <div>
                                <span className="font-mono text-label-code text-titanium-dark uppercase block mb-1.5">
                                  Estado Resultante (after)
                                </span>
                                <pre className="bg-carbon-900 border border-carbon-800 rounded p-3 font-mono text-label-code text-ice-white overflow-x-auto max-h-48">
{e.after ? JSON.stringify(e.after, null, 2) : "null (registro removido)"}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-carbon-950 px-4 py-2.5 border-t border-carbon-800 font-mono text-label-code text-titanium-muted">
          Exibindo <span className="text-ice-white">{filtered.length}</span> de{" "}
          <span className="text-ice-white">{entries.length}</span> eventos (últimos 300)
        </div>
      </div>
    </div>
  );
}
