"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Inbox,
  PackageCheck,
  PencilLine,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { MetricTile } from "@/components/shared/metric-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDrawer } from "@/components/shared/form-drawer";
import { formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import {
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_TONE,
  canTransitionPurchase,
  isEditable,
} from "@/lib/purchases/state-machine";
import type {
  PurchaseCapability,
  PurchaseOrderListRow,
  PurchaseOrderSummary,
  PurchaseStatus,
} from "@/lib/purchases/types";

export type PurchaseTab = "todos" | "aprovacoes" | "receber";

export interface PurchaseSupplierOption {
  id: string;
  name: string;
}

export interface PurchasesClientProps {
  data: {
    items: PurchaseOrderListRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: PurchaseOrderSummary;
  filters: {
    status: string;
    supplierId: string;
    q: string;
    from: string;
    to: string;
    tab: PurchaseTab;
  };
  suppliers: PurchaseSupplierOption[];
  capabilities: PurchaseCapability[];
  /** `null` = matriz de alçadas nunca configurada no tenant. */
  activeMatrixVersion: number | null;
}

type PendingDialog = { kind: "issue" | "delete"; row: PurchaseOrderListRow };

const PAGE_SIZE_OPTIONS = [
  { value: "25", label: "25 por página" },
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
];

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  ...PURCHASE_STATUSES.map((status) => ({
    value: status,
    label: PURCHASE_STATUS_LABEL[status],
  })),
];

/** Estados em que o botão "Submeter" é permitido (espelha o serviço). */
const SUBMITTABLE_STATUSES: readonly PurchaseStatus[] = [
  "rascunho",
  "rejeitado",
  "aguardando_alcada_configurada",
];

function formatDateBR(value: string | null): string {
  if (!value) return "—";
  // Datas de previsão são gravadas à meia-noite UTC: fatia a data ISO para não deslocar o dia.
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function formatDateTimeBR(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PurchaseActionResponse {
  error?: string;
  order?: { order?: { numberLabel?: string; statusLabel?: string } };
}

async function requestJson(url: string, init: RequestInit): Promise<PurchaseActionResponse> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as PurchaseActionResponse | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "Não foi possível concluir a operação de compras.");
  }
  return body ?? {};
}

const ICON_ACTION =
  "inline-flex h-7 w-7 items-center justify-center rounded border border-carbon-700 bg-carbon-800 text-titanium-light transition-colors hover:bg-carbon-700 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:cursor-not-allowed disabled:opacity-40";

/** Rascunho ainda não tem número: usa o fornecedor para identificar o pedido na UI. */
function rowDisplayLabel(row: PurchaseOrderListRow): string {
  return row.numberLabel === "Rascunho" ? `rascunho de ${row.supplierName}` : row.numberLabel;
}

export function PurchasesClient({
  data,
  summary,
  filters,
  suppliers,
  capabilities,
  activeMatrixVersion,
}: PurchasesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(filters.q);
  const [from, setFrom] = React.useState(filters.from);
  const [to, setTo] = React.useState(filters.to);
  const [pending, setPending] = React.useState<PendingDialog | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<PurchaseOrderListRow | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const can = React.useCallback(
    (capability: PurchaseCapability) => capabilities.includes(capability),
    [capabilities]
  );
  const canCreate = can("purchase.create");
  const canEdit = can("purchase.edit");
  const canSubmit = can("purchase.submit");
  const canIssue = can("purchase.issue");
  const canCancel = can("purchase.cancel");

  const navigate = React.useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "todos") params.delete(key);
        else params.set(key, value);
      }
      if (resetPage) params.delete("page");
      const qs = params.toString();
      startTransition(() => router.push(qs ? `/compras?${qs}` : "/compras"));
    },
    [router, searchParams]
  );

  const tabHref = React.useCallback(
    (tab: PurchaseTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("status");
      params.delete("page");
      if (tab === "todos") params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      return qs ? `/compras?${qs}` : "/compras";
    },
    [searchParams]
  );

  function onSubmitFilters(event: React.FormEvent) {
    event.preventDefault();
    navigate({ q: search.trim(), from: from || undefined, to: to || undefined });
  }

  function clearFilters() {
    setSearch("");
    setFrom("");
    setTo("");
    navigate({
      q: undefined,
      from: undefined,
      to: undefined,
      status: undefined,
      supplierId: undefined,
      tab: filters.tab === "todos" ? undefined : filters.tab,
    });
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    startTransition(() => router.push(`/compras?${params.toString()}`));
  }

  function changePageSize(value: string) {
    navigate({ pageSize: value === "25" ? undefined : value });
  }

  const exportQuery = React.useCallback(() => {
    const params = new URLSearchParams();
    const status =
      filters.tab === "aprovacoes"
        ? "submetido"
        : filters.tab === "receber"
          ? "emitido"
          : filters.status;
    if (status && status !== "todos") params.set("status", status);
    if (filters.supplierId !== "todos") params.set("supplierId", filters.supplierId);
    if (filters.q) params.set("q", filters.q);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("format", "csv");
    return params.toString();
  }, [filters.tab, filters.status, filters.supplierId, filters.q, filters.from, filters.to]);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/purchases/export?${exportQuery()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Não foi possível exportar a lista de compras.");
      }
      const truncated = res.headers.get("X-Export-Truncated") === "true";
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^";]+)"?/.exec(disposition);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameMatch?.[1] ?? `compras-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.warning(
          "Exportação limitada aos primeiros 5.000 pedidos. Refine os filtros para exportar o restante."
        );
      } else {
        toast.success("Lista de compras exportada em CSV com os filtros ativos.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro inesperado ao exportar a lista de compras."
      );
    } finally {
      setExporting(false);
    }
  }

  async function runAction(
    row: PurchaseOrderListRow,
    action: () => Promise<PurchaseActionResponse>,
    successMessage: (label: string, body: PurchaseActionResponse) => string
  ) {
    setBusyId(row.id);
    try {
      const body = await action();
      toast.success(successMessage(row.numberLabel, body));
      setPending(null);
      setCancelTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado na operação.");
    } finally {
      setBusyId(null);
    }
  }

  function handleSubmit(row: PurchaseOrderListRow) {
    void runAction(
      row,
      () =>
        requestJson(`/api/purchases/${row.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        }),
      (label, body) =>
        `Pedido ${rowDisplayLabel(row)} submetido — status: ${
          body.order?.order?.statusLabel ?? "Aguardando aprovação"
        }.`
    );
  }

  function handleIssue(row: PurchaseOrderListRow) {
    void runAction(
      row,
      () =>
        requestJson(`/api/purchases/${row.id}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Chave nova por clique confirmado: retry idêntico devolve o mesmo PC, sem segundo número.
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        }),
      (label) => `Pedido ${label} emitido. Número definitivo gerado.`
    );
  }

  function handleDelete(row: PurchaseOrderListRow) {
    void runAction(
      row,
      () => requestJson(`/api/purchases/${row.id}`, { method: "DELETE" }),
      () => "Rascunho excluído. Histórico mantido em auditoria."
    );
  }

  function openCancel(row: PurchaseOrderListRow) {
    setCancelTarget(row);
    setCancelReason("");
    setCancelError(null);
  }

  function closeCancel() {
    if (busyId) return;
    setCancelTarget(null);
    setCancelReason("");
    setCancelError(null);
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 5) {
      setCancelError("Justificativa obrigatória (mínimo 5 caracteres).");
      toast.error("Informe a justificativa do cancelamento.");
      return;
    }
    const target = cancelTarget;
    void runAction(
      target,
      () =>
        requestJson(`/api/purchases/${target.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: cancelReason.trim(),
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      () => `Pedido ${rowDisplayLabel(target)} cancelado. Justificativa registrada na auditoria.`
    );
  }

  function renderActions(row: PurchaseOrderListRow): React.ReactNode[] {
    const actions: React.ReactNode[] = [];
    const busy = busyId === row.id;

    actions.push(
      <Link
        key="open"
        href={`/compras/${row.id}`}
        title={`Abrir ${rowDisplayLabel(row)}`}
        aria-label={`Abrir ${rowDisplayLabel(row)}`}
        className={ICON_ACTION}
      >
        <Eye className="h-3.5 w-3.5" />
      </Link>
    );

    if (canEdit && isEditable(row.status)) {
      actions.push(
        <Link
          key="edit"
          href={`/compras/${row.id}/editar`}
          title={`Editar ${rowDisplayLabel(row)}`}
          aria-label={`Editar ${rowDisplayLabel(row)}`}
          className={ICON_ACTION}
        >
          <PencilLine className="h-3.5 w-3.5" />
        </Link>
      );
    }

    if (canSubmit && SUBMITTABLE_STATUSES.includes(row.status)) {
      actions.push(
        <button
          key="submit"
          type="button"
          title={`Submeter ${rowDisplayLabel(row)}`}
          aria-label={`Submeter ${rowDisplayLabel(row)}`}
          disabled={busy}
          onClick={() => handleSubmit(row)}
          className={ICON_ACTION}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      );
    }

    if (canIssue && row.status === "aprovado") {
      actions.push(
        <button
          key="issue"
          type="button"
          title={`Emitir ${rowDisplayLabel(row)}`}
          aria-label={`Emitir ${rowDisplayLabel(row)}`}
          disabled={busy}
          onClick={() => setPending({ kind: "issue", row })}
          className={ICON_ACTION}
        >
          <PackageCheck className="h-3.5 w-3.5" />
        </button>
      );
    }

    if (canCancel && canTransitionPurchase(row.status, "cancelado")) {
      actions.push(
        <button
          key="cancel"
          type="button"
          title={`Cancelar ${rowDisplayLabel(row)}`}
          aria-label={`Cancelar ${rowDisplayLabel(row)}`}
          disabled={busy}
          onClick={() => openCancel(row)}
          className={`${ICON_ACTION} hover:text-signal-hold`}
        >
          <Ban className="h-3.5 w-3.5" />
        </button>
      );
    }

    if (canEdit && row.status === "rascunho") {
      actions.push(
        <button
          key="delete"
          type="button"
          title={`Excluir ${rowDisplayLabel(row)}`}
          aria-label={`Excluir ${rowDisplayLabel(row)}`}
          disabled={busy}
          onClick={() => setPending({ kind: "delete", row })}
          className={`${ICON_ACTION} hover:text-signal-risk`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      );
    }

    return actions;
  }

  const activeTab = filters.tab;
  const forcedStatus =
    activeTab === "aprovacoes" ? "submetido" : activeTab === "receber" ? "emitido" : null;
  const hasFilters = Boolean(
    filters.q ||
    filters.from ||
    filters.to ||
    filters.supplierId ||
    (forcedStatus == null && filters.status !== "todos")
  );

  return (
    <div className="flex flex-col gap-space-md">
      <Breadcrumbs items={[{ label: "Início", href: "/dashboard" }, { label: "Compras" }]} />

      <PageHeader
        title="Compras"
        description="Pedidos operacionais, alçadas versionadas e aprovação humana (LAC-01)."
        badge={
          <span className="inline-flex items-center gap-1.5 rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-light">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-buy" />
            LAC-01
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={handleExport}
              disabled={exporting || isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exportando…" : "Exportar CSV"}
            </Button>
            {canCreate && (
              <Link href="/compras/nova">
                <Button variant="primary" size="md">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Pedido
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          label="Pedidos"
          hint="Total no tenant"
          icon={<ShoppingCart className="h-4 w-4" />}
          value={formatNumberBR(summary.total, 0)}
          tone="neutral"
          footer={`${formatNumberBR(summary.byStatus.rascunho ?? 0, 0)} rascunhos · ${formatNumberBR(
            summary.byStatus.cancelado ?? 0,
            0
          )} cancelados`}
        />
        <MetricTile
          label="Valor em aberto"
          hint="Ainda não emitido"
          icon={<Inbox className="h-4 w-4" />}
          value={
            <span className="text-[20px] leading-7 tracking-tight">
              {formatCurrencyBRL(summary.openGrandTotal)}
            </span>
          }
          tone="hold"
          footer={`${formatNumberBR(summary.byStatus.submetido ?? 0, 0)} aguardando decisão`}
        />
        <MetricTile
          label="Valor emitido"
          hint="Emitido + recebimentos"
          icon={<PackageCheck className="h-4 w-4" />}
          value={
            <span className="text-[20px] leading-7 tracking-tight">
              {formatCurrencyBRL(summary.issuedGrandTotal)}
            </span>
          }
          tone="buy"
          footer={`${formatNumberBR(summary.byStatus.emitido ?? 0, 0)} emitidos · ${formatNumberBR(
            summary.byStatus.recebido_completo ?? 0,
            0
          )} recebidos`}
        />
        <MetricTile
          label="Aprovações pendentes"
          hint="Na sua alçada"
          icon={<AlertTriangle className="h-4 w-4" />}
          value={formatNumberBR(summary.pendingApprovalCount, 0)}
          tone={summary.pendingApprovalCount > 0 ? "hold" : "neutral"}
          footer="Criador não aprova o próprio pedido"
        />
        <MetricTile
          label="Aguardando alçada"
          hint="Sem faixa aplicável"
          icon={<Ban className="h-4 w-4" />}
          value={formatNumberBR(summary.awaitingAlcadaCount, 0)}
          tone={summary.awaitingAlcadaCount > 0 ? "risk" : "neutral"}
          footer={
            activeMatrixVersion == null
              ? "Matriz não configurada"
              : `Matriz v${activeMatrixVersion} ativa`
          }
        />
        <MetricTile
          label="A receber"
          hint="Emitidos + parciais"
          icon={<Inbox className="h-4 w-4" />}
          value={formatNumberBR(summary.toReceiveCount, 0)}
          tone={summary.toReceiveCount > 0 ? "hold" : "neutral"}
          footer="Recebimento gera lote e movimento"
        />
      </div>

      {/* Banner de alçada não configurada */}
      {activeMatrixVersion == null && (
        <div className="flex flex-col items-start justify-between gap-space-md rounded border border-y border-r border-l-4 border-carbon-700/70 border-l-carmine-core bg-carbon-900 p-space-sm px-space-md sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-space-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-carmine-signal" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-label-caps text-label-caps font-bold uppercase text-carmine-signal">
                Matriz de alçadas não configurada
              </span>
              <span className="text-body-sm font-body-sm text-titanium-light">
                Pedidos submetidos sem faixa aplicável ficam em “Aguardando alçada” e a emissão
                permanece bloqueada até a configuração da matriz.
              </span>
            </div>
          </div>
          <Link href="/configuracoes?tab=compras" className="shrink-0">
            <Button variant="secondary" size="sm">
              Configurar matriz
            </Button>
          </Link>
        </div>
      )}

      {/* Abas */}
      <Tabs
        active={activeTab}
        items={[
          {
            key: "todos",
            label: "Todos",
            href: tabHref("todos"),
            count: summary.total,
          },
          {
            key: "aprovacoes",
            label: "Aprovações pendentes",
            href: tabHref("aprovacoes"),
            count: summary.byStatus.submetido ?? 0,
          },
          {
            key: "receber",
            label: "A receber",
            href: tabHref("receber"),
            count: summary.byStatus.emitido ?? 0,
          },
        ]}
      />

      {/* Filtros */}
      <div className="flex flex-col gap-2 rounded border border-carbon-700/80 bg-carbon-900 p-space-sm lg:flex-row lg:items-center lg:justify-between">
        <form
          onSubmit={onSubmitFilters}
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-titanium-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar fornecedor ou nº do pedido…"
              className="pl-8"
              aria-label="Buscar pedidos de compra"
            />
          </div>

          <div className="w-full sm:w-48">
            <SelectMenu
              value={forcedStatus ?? filters.status}
              onChange={(value) => navigate({ status: value })}
              options={STATUS_OPTIONS}
              aria-label="Filtrar por status"
              disabled={forcedStatus != null}
            />
          </div>

          <div className="w-full sm:w-56">
            <SelectMenu
              value={filters.supplierId}
              onChange={(value) => navigate({ supplierId: value })}
              options={[
                { value: "todos", label: "Todos os fornecedores" },
                ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
              ]}
              aria-label="Filtrar por fornecedor"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="Data inicial do período"
              className="w-36"
            />
            <span className="font-mono text-label-code text-titanium-muted">até</span>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="Data final do período"
              className="w-36"
            />
          </div>

          <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
            Filtrar
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={isPending}
            >
              Limpar
            </Button>
          )}
        </form>

        <span className="shrink-0 font-mono text-label-code text-titanium-muted">
          {formatNumberBR(data.total, 0)} pedido(s) · página {data.page} de {data.totalPages}
        </span>
      </div>

      {/* Tabela */}
      <div className="flex flex-col overflow-hidden rounded border border-carbon-700/80 bg-carbon-900">
        <div className="flex flex-col items-start justify-between gap-2 border-b border-carbon-700/80 bg-carbon-950 px-space-md py-2.5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Inbox className="h-[18px] w-[18px] text-tertiary" />
            <span className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
              Pedidos de compra
            </span>
            <span className="rounded border border-carbon-700 bg-carbon-800 px-2 py-0.5 font-mono text-label-code text-titanium-light">
              {formatNumberBR(summary.byStatus.submetido ?? 0, 0)} aguardando aprovação
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-label-code text-titanium-muted">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-buy" />
              {activeTab === "aprovacoes"
                ? "Fila de decisão"
                : activeTab === "receber"
                  ? "Aguardando recebimento"
                  : "Todos os estados"}
            </span>
            <span className="text-carbon-700">•</span>
            <span>Rascunhos excluíveis</span>
          </div>
        </div>

        {isPending ? (
          <TableSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="Nenhum pedido de compra encontrado"
            description={
              hasFilters
                ? "Ajuste os filtros ou o período para localizar pedidos."
                : "Crie o primeiro pedido de compra para iniciar a operação de compras."
            }
            actionLabel={canCreate ? "Novo pedido de compra" : undefined}
            onAction={canCreate ? () => router.push("/compras/nova") : undefined}
            icon={<ShoppingCart className="h-8 w-8 text-titanium-steel" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-2 py-2 text-center">Itens</th>
                  <th className="px-3 py-2">Entrega prevista</th>
                  <th className="px-3 py-2 text-right">Valor total</th>
                  <th className="px-3 py-2 text-right">Recebido</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2">Criado por</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {data.items.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-carbon-800/40">
                    <td className="px-3 py-2">
                      <Link
                        href={`/compras/${row.id}`}
                        className="font-mono text-body-sm font-bold text-ice-white hover:text-carmine-signal"
                      >
                        {row.numberLabel}
                      </Link>
                      <span className="block font-mono text-[10px] text-titanium-muted">
                        {formatDateTimeBR(row.createdAt)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block text-titanium-light">{row.supplierName}</span>
                      {row.awaitingMyDecision && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded border border-signal-hold/40 bg-signal-hold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-signal-hold">
                          <span className="h-1 w-1 rounded-full bg-signal-hold" />
                          Sua alçada
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-label-code text-titanium-light">
                      {row.itemCount}
                    </td>
                    <td className="px-3 py-2 font-mono text-label-code text-titanium-light">
                      {formatDateBR(row.expectedDeliveryAt)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-body-sm font-semibold text-ice-white">
                      {formatCurrencyBRL(row.grandTotal)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.receivedPct > 0 ? (
                        <div className="ml-auto flex w-20 flex-col items-end gap-1">
                          <span className="font-mono text-label-code text-signal-buy">
                            {formatNumberBR(row.receivedPct, 1)}%
                          </span>
                          <span className="h-1 w-full overflow-hidden rounded-full bg-carbon-950">
                            <span
                              className="block h-full rounded-full bg-signal-buy"
                              style={{ width: `${Math.min(100, Math.max(2, row.receivedPct))}%` }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-label-code text-titanium-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge
                        tone={PURCHASE_STATUS_TONE[row.status]}
                        label={PURCHASE_STATUS_LABEL[row.status]}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-label-code text-titanium-muted">
                      {row.createdByName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {renderActions(row)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-2 border-t border-carbon-700/80 bg-carbon-950 px-space-md py-2 font-mono text-label-code text-titanium-muted sm:flex-row">
          <span>
            Mostrando {formatNumberBR(data.items.length, 0)} de {formatNumberBR(data.total, 0)}{" "}
            pedidos
          </span>
          <div className="flex items-center gap-2">
            <div className="w-36">
              <SelectMenu
                value={String(data.pageSize)}
                onChange={changePageSize}
                options={PAGE_SIZE_OPTIONS}
                aria-label="Itens por página"
              />
            </div>
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
        isOpen={pending?.kind === "issue"}
        title={
          pending?.kind === "issue"
            ? `Emitir o pedido ${pending.row.numberLabel}?`
            : "Emitir pedido?"
        }
        description="A emissão gera o número definitivo e congela a versão aprovada. Repetir a mesma requisição devolve o mesmo pedido, sem gerar um segundo número."
        confirmLabel="Emitir pedido"
        variant="primary"
        loading={Boolean(busyId && pending?.kind === "issue")}
        onCancel={() => setPending(null)}
        onConfirm={() => pending?.kind === "issue" && handleIssue(pending.row)}
      />

      <ConfirmDialog
        isOpen={pending?.kind === "delete"}
        title={
          pending?.kind === "delete"
            ? `Excluir ${rowDisplayLabel(pending.row)}?`
            : "Excluir rascunho?"
        }
        description="O rascunho sai da listagem e não pode ser recuperado pela tela. O histórico permanece na auditoria do sistema."
        confirmLabel="Excluir rascunho"
        loading={Boolean(busyId && pending?.kind === "delete")}
        onCancel={() => setPending(null)}
        onConfirm={() => pending?.kind === "delete" && handleDelete(pending.row)}
      />

      <FormDrawer
        isOpen={cancelTarget != null}
        onClose={closeCancel}
        title={`Cancelar ${cancelTarget ? rowDisplayLabel(cancelTarget) : "pedido"}`}
        subtitle="Cancelamento exige justificativa e preserva todo o histórico."
        width="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={closeCancel}
              disabled={Boolean(busyId)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={confirmCancel}
              disabled={Boolean(busyId)}
            >
              {busyId ? "Cancelando…" : "Cancelar pedido"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cancel-reason"
            className="font-label-caps text-label-caps uppercase tracking-wider text-titanium-muted"
          >
            Justificativa (obrigatória)
          </label>
          <textarea
            id="cancel-reason"
            rows={4}
            value={cancelReason}
            onChange={(event) => {
              setCancelReason(event.target.value);
              if (cancelError) setCancelError(null);
            }}
            placeholder="Descreva o motivo do cancelamento (mínimo 5 caracteres)…"
            className={`w-full rounded border bg-carbon-950 px-3 py-2 text-body-md text-ice-white placeholder-titanium-dark transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core ${
              cancelError ? "border-signal-risk" : "border-carbon-700"
            }`}
            aria-invalid={Boolean(cancelError)}
          />
          {cancelError && <p className="text-body-sm text-carmine-signal">{cancelError}</p>}
          <p className="text-body-sm text-titanium-muted">
            A justificativa fica registrada no histórico do pedido e na trilha de auditoria. O
            número emitido, quando existir, não é reaproveitado.
          </p>
        </div>
      </FormDrawer>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-carbon-800/60" aria-busy="true" aria-label="Carregando pedidos">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="h-3 w-20 animate-pulse rounded bg-carbon-800" />
          <div className="h-3 flex-1 animate-pulse rounded bg-carbon-800" />
          <div className="h-3 w-24 animate-pulse rounded bg-carbon-800" />
          <div className="h-3 w-28 animate-pulse rounded bg-carbon-800" />
          <div className="h-3 w-16 animate-pulse rounded bg-carbon-800" />
          <div className="h-5 w-24 animate-pulse rounded bg-carbon-800" />
        </div>
      ))}
    </div>
  );
}
