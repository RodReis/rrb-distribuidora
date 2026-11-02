"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrencyBRL } from "@/lib/utils";
import {
  CHANNEL_TONES,
  QUOTE_CHANNEL_LABELS,
  hoursUntil,
  quoteStatusLabel,
  type QuoteChannel,
} from "@/lib/quotes/pricing";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilePlus2,
  Inbox,
  Layers,
  Lock,
  Search,
  Send,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

interface QuoteRow {
  id: string;
  quoteNumber: number;
  quoteNumberLabel: string;
  status: string;
  statusLabel: string;
  channel: string;
  totalAmount: string;
  grossMarginPct: string;
  validUntil: string | Date;
  createdAt: string | Date;
  customerName: string;
  customerTradeName: string | null;
  sellerName: string | null;
  expired: boolean;
  salesOrderNumber: number | null;
  summary: { count: number; quantity: number; headline: string; detail: string };
}

interface Funnel {
  openAmount: number;
  openCount: number;
  approvedAmount: number;
  approvedCount: number;
  lostAmount: number;
  lostCount: number;
  blockedCount: number;
  expiringSoonCount: number;
  todayCount: number;
  averageMarginPct: number;
  totalQuotes: number;
  conversionRatePct: number;
  remnantWeightKg: number;
  remnantItemCount: number;
  minMarginPct: number;
}

interface QuotesClientProps {
  data: {
    items: QuoteRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  funnel: Funnel;
  userRole: string;
  canWrite: boolean;
  filters: { status: string; channel: string; q: string };
}

type PendingAction = "approve" | "convert" | "send" | "negotiate" | "approve-client";

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "rascunho", label: "Rascunho" },
  { value: "bloqueado_margem", label: "Bloqueado por margem" },
  { value: "enviado", label: "Enviado" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "aprovado", label: "Aprovado" },
  { value: "perdido", label: "Perdido" },
  { value: "expirado", label: "Expirado" },
];

const CHANNEL_OPTIONS = [
  { value: "todos", label: "Todos os canais" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "counter", label: "Balcão" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "aprovado":
      return "bg-signal-buy/15 border-signal-buy/40 text-signal-buy";
    case "bloqueado_margem":
      return "bg-carmine-core/20 border-carmine-core/50 text-carmine-signal font-bold";
    case "enviado":
      return "bg-tertiary/15 border-tertiary/40 text-tertiary";
    case "em_negociacao":
      return "bg-signal-hold/15 border-signal-hold/40 text-signal-hold";
    case "perdido":
    case "expirado":
      return "bg-carbon-800 border-carbon-700 text-titanium-muted";
    default:
      return "bg-carbon-800 border-carbon-700 text-titanium-light";
  }
}

function marginClass(status: string, margin: number, minMargin: number): string {
  if (status === "bloqueado_margem" || margin < minMargin) return "text-carmine-signal font-bold";
  if (margin < minMargin + 3) return "text-signal-hold font-semibold";
  return "text-signal-buy font-semibold";
}

function timeBR(value: string | Date): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function validityLabel(row: QuoteRow): string {
  if (row.status === "aprovado") return "Aprovado";
  if (row.status === "perdido") return "Perdida";
  if (row.expired || row.status === "expirado") return "Expirada";
  const hours = hoursUntil(row.validUntil);
  if (hours <= 0) return "Expirada";
  return `${hours}h rest.`;
}

const ACTION_COPY: Record<
  PendingAction,
  { title: string; description: string; label: string; variant: "primary" | "danger" }
> = {
  approve: {
    title: "Liberar margem do orçamento?",
    description:
      "A liberação registra seu usuário como aprovador. O orçamento volta para rascunho para ser enviado ao cliente.",
    label: "Liberar margem",
    variant: "primary",
  },
  convert: {
    title: "Converter em pedido de venda?",
    description:
      "O pedido será criado com status aguardando produção e os retalhos reservados serão marcados como consumidos.",
    label: "Gerar pedido",
    variant: "primary",
  },
  send: {
    title: "Marcar orçamento como enviado?",
    description: "O orçamento passa para a etapa Enviado e entra no funil de follow-up.",
    label: "Marcar enviado",
    variant: "primary",
  },
  negotiate: {
    title: "Marcar como em negociação?",
    description: "Registra que a proposta está em tratativa com o cliente.",
    label: "Em negociação",
    variant: "primary",
  },
  "approve-client": {
    title: "Registrar aprovação do cliente?",
    description:
      "Use somente após o aceite formal do cliente. O orçamento ficará disponível para conversão em pedido.",
    label: "Cliente aprovou",
    variant: "primary",
  },
};

export function QuotesClient({ data, funnel, userRole, canWrite, filters }: QuotesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(filters.q);
  const [pending, setPending] = React.useState<{ action: PendingAction; quote: QuoteRow } | null>(
    null
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const canApproveMargin = userRole === "diretor" || userRole === "admin";

  const updateQuery = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "todos" || value === "") params.delete(key);
        else params.set(key, value);
      }
      params.delete("page");
      startTransition(() => router.push(`/vendas/orcamentos?${params.toString()}`));
    },
    [router, searchParams]
  );

  const onSubmitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateQuery({ q: search });
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    startTransition(() => router.push(`/vendas/orcamentos?${params.toString()}`));
  };

  async function runAction(action: PendingAction, quote: QuoteRow) {
    setBusy(quote.id);
    try {
      if (action === "approve") {
        const res = await fetch(`/api/quotes/${quote.id}/approve-margin`, { method: "POST" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao liberar margem.");
        toast.success(`Margem do orçamento ${quote.quoteNumberLabel} liberada.`);
      } else if (action === "convert") {
        const res = await fetch(`/api/quotes/${quote.id}/convert-to-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao gerar pedido.");
        toast.success(`Pedido de venda gerado para ${quote.quoteNumberLabel}.`);
      } else {
        const statusMap: Record<string, string> = {
          send: "enviado",
          negotiate: "em_negociacao",
          "approve-client": "aprovado",
        };
        const res = await fetch(`/api/quotes/${quote.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusMap[action] }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao atualizar status.");
        toast.success(
          `${quote.quoteNumberLabel} atualizado para ${quoteStatusLabel(statusMap[action])}.`
        );
      }
      setPending(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(null);
    }
  }

  function rowAction(quote: QuoteRow) {
    if (!canWrite) {
      return (
        <Link
          href={`/vendas/orcamentos/${quote.id}`}
          className="inline-flex items-center gap-1 rounded border border-carbon-700 bg-carbon-800 px-2 py-1 text-[11px] text-titanium-light transition-colors hover:bg-carbon-700 hover:text-ice-white"
        >
          Abrir <ArrowRight className="h-3 w-3" />
        </Link>
      );
    }

    switch (quote.status) {
      case "bloqueado_margem":
        return canApproveMargin ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy === quote.id}
            onClick={() => setPending({ action: "approve", quote })}
          >
            <Lock className="mr-1 h-3 w-3" /> Liberar gerência
          </Button>
        ) : (
          <span className="text-[10px] text-signal-hold">Aguardando diretor</span>
        );
      case "aprovado":
        if (quote.salesOrderNumber != null) {
          return (
            <Link
              href={`/vendas/orcamentos/${quote.id}`}
              className="rounded border border-signal-buy/40 bg-signal-buy/10 px-2 py-1 text-[11px] font-semibold text-signal-buy transition-colors hover:bg-signal-buy/20"
            >
              Pedido #{quote.salesOrderNumber}
            </Link>
          );
        }
        return (
          <Button
            size="sm"
            variant="primary"
            disabled={busy === quote.id}
            onClick={() => setPending({ action: "convert", quote })}
          >
            <ShoppingCart className="mr-1 h-3 w-3" /> Gerar pedido
          </Button>
        );
      case "rascunho":
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/vendas/orcamentos/${quote.id}/editar`}
              className="rounded border border-carbon-700 bg-carbon-800 px-2 py-1 text-[11px] text-titanium-light transition-colors hover:bg-carbon-700 hover:text-ice-white"
            >
              Editar
            </Link>
            <Button
              size="sm"
              variant="primary"
              disabled={busy === quote.id}
              onClick={() => setPending({ action: "send", quote })}
            >
              <Send className="mr-1 h-3 w-3" /> Enviar
            </Button>
          </div>
        );
      case "enviado":
        return (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy === quote.id}
            onClick={() => setPending({ action: "negotiate", quote })}
          >
            Follow-up
          </Button>
        );
      case "em_negociacao":
        return (
          <Button
            size="sm"
            variant="primary"
            disabled={busy === quote.id}
            onClick={() => setPending({ action: "approve-client", quote })}
          >
            Cliente aprovou
          </Button>
        );
      default:
        return (
          <Link
            href={`/vendas/orcamentos/${quote.id}`}
            className="inline-flex items-center gap-1 rounded border border-carbon-700 bg-carbon-800 px-2 py-1 text-[11px] text-titanium-light transition-colors hover:bg-carbon-700 hover:text-ice-white"
          >
            Abrir <ArrowRight className="h-3 w-3" />
          </Link>
        );
    }
  }

  const alert =
    funnel.blockedCount > 0
      ? {
          title: "ALERTA PREVENTIVO DE MARGEM:",
          text: `${funnel.blockedCount} orçamento(s) abaixo da política de ${funnel.minMarginPct.toFixed(
            2
          )}% ou do custo de reposição aguardam liberação do diretor. A emissão permanece travada até a alçada gerencial.`,
          tone: "risk" as const,
        }
      : funnel.expiringSoonCount > 0
        ? {
            title: "ALERTA DE VALIDADE:",
            text: `${funnel.expiringSoonCount} proposta(s) expiram nas próximas 48 horas. Reforce o follow-up antes do reajuste por volatilidade de mercado.`,
            tone: "hold" as const,
          }
        : {
            title: "PRECIFICAÇÃO POR REPOSIÇÃO ATIVA:",
            text: `Custos de reposição atualizados pelo índice de mercado com trava de ±20%. Margem mínima da política: ${funnel.minMarginPct.toFixed(
              2
            )}%.`,
            tone: "neutral" as const,
          };

  return (
    <div className="flex flex-col gap-space-md">
      <Breadcrumbs
        items={[
          { label: "Vendas & Orçamentos", href: "/vendas/orcamentos" },
          { label: "Orçamentos" },
        ]}
      />

      {/* HEADER */}
      <div className="flex flex-col gap-space-md rounded border border-carbon-700/80 bg-carbon-900 p-space-md xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-ice-white">
              Vendas, Orçamentos Ágeis &amp; Precificação
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded border border-signal-buy/30 bg-signal-buy/10 px-2 py-0.5 font-label-code text-label-code text-signal-buy">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-buy" />
              MOTOR DETERMINÍSTICO ATIVO
            </span>
          </div>
          <p className="text-body-sm font-body-sm text-titanium-muted">
            Cálculo metalúrgico auditável, precificação por reposição e matching de retalhos do
            estoque.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-space-md gap-y-1 font-label-code text-label-code text-titanium-light">
            <span className="flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-tertiary" />
              <span className="text-titanium-muted">Fórmulas:</span> chapa, disco, barra e tubo
            </span>
            <span className="text-carbon-700">•</span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-tertiary" />
              <span className="text-titanium-muted">Retalhos alocados:</span>{" "}
              <strong className="font-semibold text-ice-white">{funnel.remnantItemCount}</strong>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              <span className="text-titanium-muted">Validade dinâmica:</span>{" "}
              <span className="text-ice-white">5–7 dias ou 48–72h</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 self-stretch xl:self-auto">
          {canWrite && (
            <Link href="/vendas/orcamentos/novo">
              <Button variant="primary" size="md">
                <FilePlus2 className="mr-2 h-4 w-4" />
                NOVO ORÇAMENTO
                <span className="ml-2 rounded bg-black/30 px-1.5 py-0.5 font-label-code text-label-code text-white/80">
                  [F2]
                </span>
              </Button>
            </Link>
          )}
          <Link href="/vendas/orcamentos/novo?focus=simulador">
            <Button variant="secondary" size="md">
              <Calculator className="mr-2 h-4 w-4" />
              SIMULADOR GEOMÉTRICO
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="ORÇAMENTOS HOJE"
          badge="DETERMINÍSTICO"
          badgeTone="tertiary"
          value={String(funnel.todayCount)}
          aside={`${funnel.openCount} em aberto`}
          progress={
            funnel.totalQuotes > 0
              ? Math.min(100, (funnel.todayCount / funnel.totalQuotes) * 100)
              : 0
          }
          progressTone="tertiary"
          footerLeft={`Carteira aberta: ${formatCurrencyBRL(funnel.openAmount)}`}
          footerRight={`Bloqueados: ${funnel.blockedCount}`}
        />
        <KpiTile
          label="CONVERSÃO DE PROPOSTAS"
          badge={`${funnel.approvedCount} aprovadas`}
          badgeTone="buy"
          value={`${funnel.conversionRatePct.toFixed(1)}%`}
          aside={`${funnel.lostCount} perdidas`}
          progress={funnel.conversionRatePct}
          progressTone="buy"
          footerLeft={`Convertido: ${formatCurrencyBRL(funnel.approvedAmount)}`}
          footerRight={`Total: ${funnel.totalQuotes}`}
        />
        <KpiTile
          label="MARGEM MÉDIA (REPOSIÇÃO)"
          badge="BLINDAGEM DE CAIXA"
          badgeTone="risk"
          value={`${funnel.averageMarginPct.toFixed(2)}%`}
          aside={`Política ${funnel.minMarginPct.toFixed(2)}%`}
          progress={Math.min(100, Math.max(0, funnel.averageMarginPct))}
          progressTone="carmine"
          footerLeft={`Perdido: ${formatCurrencyBRL(funnel.lostAmount)}`}
          footerRight={`Expirando: ${funnel.expiringSoonCount}`}
        />
        <KpiTile
          label="RETALHOS ALOCADOS"
          badge="MATCHING M2"
          badgeTone="buy"
          value={`${funnel.remnantWeightKg.toFixed(1)} kg`}
          aside={`${funnel.remnantItemCount} itens`}
          progress={Math.min(100, funnel.remnantItemCount * 8)}
          progressTone="tertiary"
          footerLeft="Material reaproveitado em propostas"
          footerRight="Custo de retalho: 65% da reposição"
        />
      </div>

      {/* ALERT BANNER */}
      <div
        className={
          alert.tone === "risk"
            ? "flex flex-col items-start justify-between gap-space-md rounded border-y border-r border-l-4 border-carmine-core border-carbon-700/70 bg-carbon-900 p-space-sm px-space-md sm:flex-row sm:items-center"
            : alert.tone === "hold"
              ? "flex flex-col items-start justify-between gap-space-md rounded border-y border-r border-l-4 border-signal-hold border-carbon-700/70 bg-carbon-900 p-space-sm px-space-md sm:flex-row sm:items-center"
              : "flex flex-col items-start justify-between gap-space-md rounded border-y border-r border-l-4 border-tertiary border-carbon-700/70 bg-carbon-900 p-space-sm px-space-md sm:flex-row sm:items-center"
        }
      >
        <div className="flex min-w-0 items-center gap-space-sm">
          {alert.tone === "risk" ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-carmine-signal" />
          ) : alert.tone === "hold" ? (
            <Clock className="h-5 w-5 shrink-0 text-signal-hold" />
          ) : (
            <TrendingUp className="h-5 w-5 shrink-0 text-tertiary" />
          )}
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span
              className={
                alert.tone === "risk"
                  ? "shrink-0 font-label-caps text-label-caps font-bold uppercase text-carmine-signal"
                  : alert.tone === "hold"
                    ? "shrink-0 font-label-caps text-label-caps font-bold uppercase text-signal-hold"
                    : "shrink-0 font-label-caps text-label-caps font-bold uppercase text-tertiary"
              }
            >
              {alert.title}
            </span>
            <span className="truncate font-body-sm text-body-sm text-titanium-light">
              {alert.text}
            </span>
          </div>
        </div>
        {funnel.blockedCount > 0 && canApproveMargin && (
          <Link
            href="/vendas/orcamentos?status=bloqueado_margem"
            className="shrink-0 rounded border border-carmine-core/40 bg-carmine-core/10 px-2 py-1 font-label-code text-label-code text-carmine-signal transition-colors hover:bg-carmine-core/20"
          >
            Ver bloqueados
          </Link>
        )}
      </div>

      {/* FILTERS */}
      <div className="flex flex-col gap-2 rounded border border-carbon-700/80 bg-carbon-900 p-space-sm sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={onSubmitSearch}
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-titanium-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente ou nº da proposta…"
              className="pl-8"
              aria-label="Buscar orçamentos"
            />
          </div>
          <div className="w-full sm:w-48">
            <SelectMenu
              value={filters.status}
              onChange={(value) => updateQuery({ status: value })}
              options={STATUS_OPTIONS}
              aria-label="Filtrar por status"
            />
          </div>
          <div className="w-full sm:w-44">
            <SelectMenu
              value={filters.channel}
              onChange={(value) => updateQuery({ channel: value })}
              options={CHANNEL_OPTIONS}
              aria-label="Filtrar por canal"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
            Filtrar
          </Button>
        </form>
        <span className="font-label-code text-label-code text-titanium-muted">
          {data.total} proposta(s) · página {data.page} de {data.totalPages}
        </span>
      </div>

      {/* TABLE */}
      <div className="flex flex-col overflow-hidden rounded border border-carbon-700/80 bg-carbon-900">
        <div className="flex flex-col items-start justify-between gap-2 border-b border-carbon-700/80 bg-carbon-950 px-space-md py-2.5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Inbox className="h-[18px] w-[18px] text-tertiary" />
            <span className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
              FILA OPERACIONAL DE COTAÇÕES
            </span>
            <span className="rounded-full border border-carbon-700 bg-carbon-800 px-2 py-0.5 font-label-code text-label-code text-titanium-light">
              {funnel.openCount} ativas
            </span>
          </div>
          <div className="flex items-center gap-2 font-label-code text-label-code text-titanium-muted">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-buy" /> Reposição sincronizada
            </span>
            <span className="text-carbon-700">•</span>
            <span>Margem mínima {funnel.minMarginPct.toFixed(2)}%</span>
          </div>
        </div>

        {data.items.length === 0 ? (
          <EmptyState
            title="Nenhum orçamento encontrado"
            description="Ajuste os filtros ou crie a primeira proposta comercial com cálculo determinístico."
            actionLabel={canWrite ? "Novo orçamento" : undefined}
            onAction={canWrite ? () => router.push("/vendas/orcamentos/novo") : undefined}
            icon={<FilePlus2 className="h-8 w-8 text-titanium-steel" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="sticky top-0 border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th className="px-3 py-2">ID / Proposta</th>
                  <th className="px-3 py-2">Cliente / Conta</th>
                  <th className="px-2 py-2 text-center">Canal</th>
                  <th className="px-3 py-2">Geometria &amp; Especificação</th>
                  <th className="px-3 py-2 text-right">Valor Total</th>
                  <th className="px-2 py-2 text-right">Margem Líq.</th>
                  <th className="px-2 py-2 text-center">Validade</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Ação Direta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80 font-label-code text-label-code">
                {data.items.map((quote) => {
                  const margin = Number(quote.grossMarginPct);
                  const blocked = quote.status === "bloqueado_margem";
                  const channel = quote.channel as QuoteChannel;
                  return (
                    <tr
                      key={quote.id}
                      className={
                        blocked
                          ? "border-l-2 border-carmine-core bg-carmine-dark/10 transition-colors hover:bg-carmine-dark/20"
                          : "transition-colors hover:bg-carbon-800/40"
                      }
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/vendas/orcamentos/${quote.id}`}
                          className={
                            blocked
                              ? "font-bold text-carmine-signal hover:underline"
                              : "font-bold text-ice-white hover:text-carmine-signal"
                          }
                        >
                          {quote.quoteNumberLabel}
                        </Link>
                        <span className="block text-[10px] text-titanium-muted">
                          {timeBR(quote.createdAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-ice-white">
                          {quote.customerTradeName || quote.customerName}
                        </div>
                        <div className="text-[10px] text-titanium-muted">
                          {quote.sellerName ? `Vendedor: ${quote.sellerName}` : "—"}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${
                            CHANNEL_TONES[channel] ??
                            "border-carbon-700 bg-carbon-800 text-titanium-light"
                          }`}
                        >
                          {(QUOTE_CHANNEL_LABELS[channel] ?? quote.channel).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-titanium-light">
                        <div className="line-clamp-1">{quote.summary.headline}</div>
                        <div className="text-[10px] text-titanium-muted">
                          {quote.summary.count > 1 ? `${quote.summary.count} itens · ` : ""}
                          {quote.summary.detail}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-ice-white">
                        {formatCurrencyBRL(quote.totalAmount)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right ${marginClass(quote.status, margin, funnel.minMarginPct)}`}
                      >
                        {margin.toFixed(1)}%
                        {blocked && <span className="ml-1 text-[9px]">[ALERTA]</span>}
                      </td>
                      <td
                        className={
                          quote.expired || quote.status === "expirado"
                            ? "px-2 py-2 text-center text-titanium-muted"
                            : quote.status === "aprovado"
                              ? "px-2 py-2 text-center font-semibold text-signal-buy"
                              : "px-2 py-2 text-center text-signal-hold"
                        }
                      >
                        {validityLabel(quote)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] ${statusBadgeClass(
                            quote.status
                          )}`}
                        >
                          {quote.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end">{rowAction(quote)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-2 border-t border-carbon-700/80 bg-carbon-950 px-space-md py-2 font-label-code text-label-code text-titanium-muted sm:flex-row">
          <span>
            Mostrando {data.items.length} de {data.total} cotações
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={data.page <= 1 || isPending}
              onClick={() => goToPage(data.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              {data.page} / {data.totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={data.page >= data.totalPages || isPending}
              onClick={() => goToPage(data.page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pending}
        title={pending ? ACTION_COPY[pending.action].title : ""}
        description={pending ? ACTION_COPY[pending.action].description : ""}
        confirmLabel={pending ? ACTION_COPY[pending.action].label : "Confirmar"}
        variant={pending ? ACTION_COPY[pending.action].variant : "primary"}
        loading={!!pending && busy === pending.quote.id}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && runAction(pending.action, pending.quote)}
      />
    </div>
  );
}

function KpiTile({
  label,
  badge,
  badgeTone,
  value,
  aside,
  progress,
  progressTone,
  footerLeft,
  footerRight,
}: {
  label: string;
  badge: string;
  badgeTone: "tertiary" | "buy" | "risk";
  value: string;
  aside: string;
  progress: number;
  progressTone: "tertiary" | "buy" | "carmine";
  footerLeft: string;
  footerRight: string;
}) {
  const badgeClass =
    badgeTone === "buy"
      ? "text-signal-buy"
      : badgeTone === "risk"
        ? "text-carmine-signal font-semibold"
        : "text-tertiary";
  const barClass =
    progressTone === "buy"
      ? "bg-signal-buy"
      : progressTone === "carmine"
        ? "bg-carmine-core"
        : "bg-tertiary";

  return (
    <div className="flex flex-col justify-between rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
      <div className="flex items-center justify-between font-label-caps text-label-caps text-titanium-muted">
        <span>{label}</span>
        <span className={`font-label-code text-label-code ${badgeClass}`}>{badge}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-metric-display text-metric-display font-bold tracking-tight text-ice-white">
          {value}
        </span>
        <span className="font-label-code text-label-code text-titanium-muted">{aside}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-carbon-950">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-label-code text-label-code text-titanium-muted">
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </div>
  );
}
