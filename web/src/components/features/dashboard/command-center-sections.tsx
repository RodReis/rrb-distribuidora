import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  Gavel,
  Landmark,
  LockKeyhole,
  Package,
  Percent,
  Radar,
  ShieldCheck,
  Table2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { MetricTile, type MetricTone } from "@/components/shared/metric-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/inline-markdown";
import type { CommandCenterData } from "@/lib/dashboard/command-center";
import { AskCopilotButton } from "./copilot-launchers";
import { GLOBAL_LEVEL_LABEL, LEVEL_STYLES, LevelBadge } from "./level";

const brl0 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pt = (n: number, d = 1) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number) => `${n > 0 ? "+" : ""}${pt(n)}%`;

function Panel({
  icon,
  title,
  subtitle,
  aside,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("flex flex-col rounded-md border border-carbon-800 bg-carbon-900", className)}
    >
      <div className="flex flex-col justify-between gap-2 bg-carbon-950/40 p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="text-carmine-signal">{icon}</span>
          <div>
            <h2 className="text-headline-sm font-semibold leading-tight text-ice-white">{title}</h2>
            <span className="font-mono text-label-code text-titanium-muted">{subtitle}</span>
          </div>
        </div>
        {aside}
      </div>
      <div className="flex-1 p-3">{children}</div>
    </section>
  );
}

export function CommandHeader({
  data,
  user,
}: {
  data: CommandCenterData;
  user: { name: string; role: string };
}) {
  const now = new Date();
  const whenRaw = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const when = whenRaw.charAt(0).toUpperCase() + whenRaw.slice(1);

  return (
    <header className="flex flex-col justify-between gap-3 rounded-md border border-carbon-800 bg-carbon-900 p-3 xl:flex-row xl:items-center">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-headline-sm font-bold tracking-tight text-ice-white">
            Command Center <span className="font-mono text-carmine-core">{"//"}</span> Visão
            Executiva
          </h1>
          <span className="rounded bg-carmine-core/15 px-2 py-0.5 font-mono text-label-code font-semibold uppercase text-carmine-signal">
            {user.role}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label-code text-titanium-muted">
          <span className="text-titanium-light">{when} BRT</span>
          <span className="text-carbon-700">|</span>
          <span>
            Sessão: <strong className="text-ice-white">{user.name}</strong>
          </span>
          <span className="text-carbon-700">|</span>
          <span>
            Próximo briefing: <strong className="text-ice-white">06:55 BRT</strong>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Risco global"
          value={GLOBAL_LEVEL_LABEL[data.globalLevel]}
          valueClass={LEVEL_STYLES[data.globalLevel].text}
        />
        <StatusPill
          icon={<Bot className="h-4 w-4" />}
          label="Copiloto"
          value="SOMENTE LEITURA"
          valueClass="text-ice-white"
        />
        <StatusPill
          icon={<LockKeyhole className="h-4 w-4" />}
          label="Human-in-the-loop"
          value="APROVAÇÃO HUMANA"
          valueClass="text-signal-hold"
        />
        <div className="mx-1 hidden h-6 w-px bg-carbon-700 lg:block" />
        <Link
          href="/governanca"
          className="inline-flex h-8 items-center gap-1.5 rounded border border-carbon-700 bg-carbon-800 px-3 text-label-caps font-semibold uppercase tracking-wider text-ice-white transition-colors hover:bg-carbon-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
        >
          <Gavel className="h-4 w-4 text-titanium-muted" />
          Governança de IA
        </Link>
        <AskCopilotButton />
      </div>
    </header>
  );
}

function StatusPill({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded bg-carbon-950 px-2.5 py-1">
      <span className={valueClass}>{icon}</span>
      <div className="flex flex-col">
        <span className="font-mono text-label-code uppercase leading-tight text-titanium-muted">
          {label}
        </span>
        <span className={cn("font-mono text-label-code font-bold leading-tight", valueClass)}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function KpiGrid({ data }: { data: CommandCenterData }) {
  const { quotes, stock, market } = data;

  const marginTone: MetricTone =
    quotes.marginDeltaPp == null ? "neutral" : quotes.marginDeltaPp >= 0 ? "buy" : "risk";
  const marginBadge =
    quotes.marginDeltaPp != null ? (
      <span
        className={cn(
          "rounded px-2 py-0.5 font-mono text-label-code font-semibold",
          quotes.marginDeltaPp >= 0
            ? "bg-signal-buy/15 text-signal-buy"
            : "bg-carmine-core/15 text-carmine-signal"
        )}
      >
        {quotes.marginDeltaPp > 0 ? "+" : ""}
        {pt(quotes.marginDeltaPp)} p.p. vs mês ant.
      </span>
    ) : null;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricTile
        label="Faturamento previsto"
        hint="Propostas abertas (enviadas, em negociação, bloqueadas)"
        icon={<CircleDollarSign className="h-[18px] w-[18px]" />}
        value={brl0(quotes.openTotal)}
        footer={`${quotes.openCount} proposta${quotes.openCount === 1 ? "" : "s"} · ${quotes.blockedCount} bloqueada${quotes.blockedCount === 1 ? "" : "s"} por margem`}
      />
      <MetricTile
        label="Margem bruta do mês"
        hint="Média dos orçamentos aprovados no mês"
        icon={<Percent className="h-[18px] w-[18px]" />}
        value={quotes.marginMonthPct != null ? `${pt(quotes.marginMonthPct)}%` : "—"}
        tone={marginTone}
        badge={marginBadge}
        footer={
          quotes.approvedMonthCount > 0
            ? `${quotes.approvedMonthCount} orçamento${quotes.approvedMonthCount === 1 ? "" : "s"} aprovado${quotes.approvedMonthCount === 1 ? "" : "s"} no mês`
            : "Nenhum orçamento aprovado no mês"
        }
      />
      <MetricTile
        label="SKUs em ruptura crítica"
        hint="Cobertura abaixo do lead time"
        icon={<Package className="h-[18px] w-[18px]" />}
        value={String(stock.criticalCount)}
        tone={stock.criticalCount > 0 ? "risk" : "buy"}
        footer={
          stock.criticalCount > 0
            ? `Déficit potencial: ${brl0(stock.potentialDeficitBrl)} · ${stock.warningCount} em atenção`
            : `${stock.warningCount} SKU${stock.warningCount === 1 ? "" : "s"} em atenção`
        }
      />
      <MetricTile
        label="Reposição vs. mês anterior"
        hint="Variação 30d dos índices de mercado"
        icon={<TrendingUp className="h-[18px] w-[18px]" />}
        value={market.aluminium?.change30d != null ? signed(market.aluminium.change30d) : "—"}
        unit="Alumínio"
        footer={`Aço (HRC): ${market.hrc?.change30d != null ? signed(market.hrc.change30d) : "—"} · não é o custo médio cadastrado`}
      />
      <MetricTile
        label="Dólar PTAX"
        hint="BCB, último fechamento ingerido"
        icon={<Landmark className="h-[18px] w-[18px]" />}
        value={market.ptax?.last != null ? `R$ ${pt(market.ptax.last, 4)}` : "—"}
        badge={
          market.ptax?.change7d != null ? (
            <span className="rounded bg-carbon-800 px-2 py-0.5 font-mono text-label-code text-titanium-light">
              {signed(market.ptax.change7d)} em 7d
            </span>
          ) : null
        }
        footer={
          market.importSpreadPct != null
            ? `Spread médio de importação: ${pt(market.importSpreadPct)}%`
            : "Spread de importação: sem configuração de paridade salva"
        }
      />
      <MetricTile
        label="Dias de estoque (DIO)"
        hint="Valor em estoque ÷ consumo médio diário (90d)"
        icon={<Timer className="h-[18px] w-[18px]" />}
        value={stock.dioDays != null ? String(stock.dioDays) : "—"}
        unit={stock.dioDays != null ? "dias" : undefined}
        footer={
          stock.agedLotsCount > 0
            ? `Capital parado > 180d: ${brl0(stock.agedCapitalBrl)} (${stock.agedLotsCount} lote${stock.agedLotsCount === 1 ? "" : "s"})`
            : "Sem capital parado acima de 180 dias"
        }
      />
    </section>
  );
}

export function DecisionQueue({
  data,
  canApprove,
}: {
  data: CommandCenterData;
  canApprove: boolean;
}) {
  const { pending, resolvedLast24h } = data.decisions;

  return (
    <Panel
      className="xl:col-span-7"
      icon={<Gavel className="h-5 w-5" />}
      title="Fila de Decisões Human-in-the-Loop"
      subtitle="Propostas travadas por margem ou custo de reposição"
      aside={
        <LevelBadge level={pending.length > 0 ? "risk" : "ok"}>
          {pending.length > 0
            ? `${data.quotes.blockedCount} pendência${data.quotes.blockedCount === 1 ? "" : "s"} · ${brl0(data.quotes.blockedTotal)}`
            : "Sem pendências"}
        </LevelBadge>
      }
    >
      {pending.length === 0 ? (
        <EmptyState
          title="Nenhuma decisão pendente"
          description="Propostas abaixo da margem mínima ou do custo de reposição aparecem aqui para liberação do diretor."
        />
      ) : (
        <ul className="space-y-2">
          {pending.map((d) => {
            const belowMargin = d.marginPct < d.minMarginPct;
            return (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded bg-carbon-800 p-3 transition-colors hover:bg-carbon-700/60 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-carmine-signal" />
                    <span className="font-mono text-label-code uppercase text-titanium-muted">
                      Proposta #{d.quoteNumber}
                    </span>
                    <span className="rounded bg-carbon-950 px-2 py-0.5 font-mono text-label-code font-semibold text-titanium-light">
                      {d.customer}
                    </span>
                    <span className="font-mono text-label-code text-titanium-muted">
                      Vendedor: {d.seller}
                    </span>
                  </div>
                  <p className="rounded bg-carbon-950/70 p-2 text-body-sm text-titanium-light">
                    <span className="font-mono text-label-code font-semibold uppercase text-signal-hold">
                      Motivo:{" "}
                    </span>
                    {belowMargin
                      ? `margem de ${pt(d.marginPct)}% abaixo da mínima de ${pt(d.minMarginPct)}%.`
                      : "preço de venda abaixo do custo de reposição."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
                  <span className="font-mono text-metric-regular font-bold text-ice-white">
                    {brl0(d.totalAmount)}
                  </span>
                  <Link
                    href={`/vendas/orcamentos/${d.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-carbon-600 bg-carbon-700 px-3 text-label-caps font-semibold uppercase tracking-wider text-ice-white transition-colors hover:bg-carbon-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                  >
                    {canApprove ? "Decidir" : "Ver proposta"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-label-code text-titanium-muted">
        <span>
          {canApprove
            ? "A liberação é feita na tela da proposta. O sistema nunca libera sozinho."
            : "Somente diretor ou admin libera. Seu papel pode apenas acompanhar."}
        </span>
        <span className="text-signal-buy">
          {resolvedLast24h} {pluralize(resolvedLast24h, "liberação", "liberações")} nas últimas 24h
        </span>
      </div>
    </Panel>
  );
}

export function RiskMatrix({ data }: { data: CommandCenterData }) {
  const flagged = data.risks.filter((r) => r.level === "risk").length;

  return (
    <Panel
      className="xl:col-span-5"
      icon={<Radar className="h-5 w-5" />}
      title="Matriz de Riscos"
      subtitle="O que o sistema mede hoje, por dimensão"
      aside={
        <LevelBadge level={flagged > 0 ? "risk" : "ok"}>
          {flagged} crítico{flagged === 1 ? "" : "s"}
        </LevelBadge>
      }
    >
      <ul className="space-y-2">
        {data.risks.map((risk) => (
          <li
            key={risk.key}
            className="flex flex-col gap-1.5 rounded bg-carbon-800/80 p-2.5 transition-colors hover:bg-carbon-800"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-label-caps font-semibold uppercase text-ice-white">
                {risk.title}
              </span>
              <LevelBadge level={risk.level}>{risk.badge}</LevelBadge>
            </div>
            <p className="text-body-sm text-titanium-light">{risk.text}</p>
            <Link
              href={risk.next.href}
              className="inline-flex w-fit items-center gap-1 rounded bg-carbon-950 px-2 py-1 font-mono text-label-code text-titanium-light transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              {risk.next.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Thermometer({ data }: { data: CommandCenterData }) {
  return (
    <Panel
      icon={<ShieldCheck className="h-5 w-5" />}
      title="Termômetro Departamental"
      subtitle="Departamentos sem módulo no sistema aparecem como “sem dados”"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {data.thermometer.map((item) => (
          <div
            key={item.department}
            className="flex flex-col items-start gap-1.5 rounded bg-carbon-800 p-2.5"
          >
            <span className="text-label-caps font-semibold uppercase text-ice-white">
              {item.department}
            </span>
            <LevelBadge level={item.level}>{item.label}</LevelBadge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RecommendationsTable({ data }: { data: CommandCenterData }) {
  return (
    <Panel
      icon={<Table2 className="h-5 w-5" />}
      title="Matriz de Recomendações"
      subtitle="Ações sugeridas, ordenadas pelo valor envolvido"
    >
      {data.recommendations.length === 0 ? (
        <EmptyState
          title="Nada a recomendar agora"
          description="Sem rupturas críticas, propostas bloqueadas ou lotes parados. As recomendações aparecem aqui assim que surgirem."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="select-none border-b border-carbon-800 bg-carbon-950 text-label-caps font-semibold uppercase tracking-wider text-titanium-muted">
                <th className="px-3 py-2">Departamento</th>
                <th className="px-3 py-2">Ação sugerida</th>
                <th className="px-3 py-2">Detalhe</th>
                <th className="px-3 py-2 text-right">Valor envolvido</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60">
              {data.recommendations.map((rec, idx) => (
                <tr
                  key={rec.id}
                  className={cn(
                    "transition-colors hover:bg-carbon-800/40",
                    idx % 2 === 0 ? "bg-carbon-900/50" : "bg-carbon-950/40"
                  )}
                >
                  <td className="px-3 py-2 text-body-sm text-titanium-light">{rec.department}</td>
                  <td className="px-3 py-2 text-body-sm font-medium text-ice-white">
                    {rec.action}
                  </td>
                  <td className="px-3 py-2 font-mono text-label-code text-titanium-muted">
                    {rec.detail}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-metric-regular text-ice-white">
                    {rec.amountBrl != null ? brl0(rec.amountBrl) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={rec.href}
                      aria-label={`Abrir: ${rec.action}`}
                      className="inline-flex rounded p-1 text-titanium-muted transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 font-mono text-label-code text-titanium-muted">
        Valor envolvido não é sempre perda: em reposição é o custo estimado da compra sugerida; em
        propostas é a receita em decisão; em lotes parados é o capital imobilizado.
      </p>
    </Panel>
  );
}
