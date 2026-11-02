"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES, type AuditFilters } from "@/lib/governance/filters";

export function AuditFiltersBar({ filters, agents }: { filters: AuditFilters; agents: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = React.useState(filters.q);
  const [agent, setAgent] = React.useState(filters.agent);
  const [feedback, setFeedback] = React.useState<string>(filters.feedback);
  const [size, setSize] = React.useState(String(filters.size));

  function apply(event?: React.FormEvent) {
    event?.preventDefault();
    const params = new URLSearchParams({ tab: "auditoria" });
    if (q.trim()) params.set("q", q.trim());
    if (agent) params.set("agente", agent);
    if (feedback !== "todos") params.set("feedback", feedback);
    if (size !== "25") params.set("size", size);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setQ("");
    setAgent("");
    setFeedback("todos");
    setSize("25");
    router.push(`${pathname}?tab=auditoria`);
  }

  return (
    <form
      onSubmit={apply}
      className="flex flex-col items-stretch gap-2.5 rounded border border-carbon-800 bg-carbon-900 p-3 lg:flex-row lg:items-center"
    >
      <div className="relative w-full flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-titanium-dark" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar no texto da pergunta…"
          aria-label="Buscar no texto da pergunta"
          className="h-9 w-full rounded border border-carbon-700 bg-carbon-950 pl-9 pr-3 text-body-md text-ice-white placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
        />
      </div>
      <div className="w-full lg:w-44">
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
          <option value="">Agente: todos</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-full lg:w-44">
        <Select
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          aria-label="Avaliação"
        >
          <option value="todos">Avaliação: todas</option>
          <option value="positivo">Útil</option>
          <option value="negativo">Não útil</option>
          <option value="sem">Sem avaliação</option>
        </Select>
      </div>
      <div className="w-full lg:w-32">
        <Select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          aria-label="Itens por página"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / pág.
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="md">
          Filtrar
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={clear}>
          Limpar
        </Button>
      </div>
    </form>
  );
}
