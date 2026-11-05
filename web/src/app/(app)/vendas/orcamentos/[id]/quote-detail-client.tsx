"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDrawer } from "@/components/shared/form-drawer";
import { SelectMenu } from "@/components/ui/select-menu";
import { Input } from "@/components/ui/input";
import { formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import {
  LOSS_REASONS,
  QUOTE_CHANNEL_LABELS,
  orderStatusLabel,
  type QuoteChannel,
} from "@/lib/quotes/pricing";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Send,
  ShieldAlert,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PROCESS_LABELS } from "../quote-types";

export interface QuoteDetailItem {
  id: string;
  productId: string;
  remnantId: string | null;
  geometryType: string;
  thicknessMm: string;
  widthMm: string | null;
  lengthMm: string | null;
  diameterMm: string | null;
  innerDiameterMm: string | null;
  wallMm: string | null;
  processType: string | null;
  quantity: number;
  netWeightKg: string;
  grossWeightKg: string;
  scrapPct: string;
  unitMaterialCost: string;
  unitProcessCost: string;
  unitPrice: string;
  totalItemAmount: string;
  itemMarginPct: string;
  replacementCostPerKg: string;
  setupMinutes: string | null;
  estimatedCutTimeMinutes: string | null;
  sku: string;
  description: string;
  norm: string;
  family: string;
  machineName: string | null;
  remnantCode: string | null;
}

export interface QuoteDetailData {
  id: string;
  quoteNumberLabel: string;
  status: string;
  statusLabel: string;
  channel: string;
  createdAt: string;
  validUntil: string;
  expired: boolean;
  totalMaterialCost: number;
  totalProcessCost: number;
  totalFreightCost: number;
  totalServicesCost: number;
  totalAmount: number;
  grossMarginPct: number;
  minMarginPct: number;
  marketSymbol: string | null;
  marketVolatilityPct: number;
  paymentTerms: string | null;
  deliveryMethod: string | null;
  deliveryDeadline: string | null;
  bankingInfo: string | null;
  notes: string | null;
  lossReason: string | null;
  pdfFileKey: string | null;
  approvedAt: string | null;
  approvedByDirectorId: string | null;
  targetMarginPct: number;
  discountPct: number;
  customer: {
    id: string;
    legalName: string;
    tradeName: string | null;
    document: string;
    city: string | null;
    uf: string | null;
    contacts: { email?: string; phone?: string; contactName?: string } | null;
  };
  sellerName: string | null;
  tenantName: string | null;
  items: QuoteDetailItem[];
  salesOrder: {
    id: string;
    orderNumber: number;
    orderStatus: string;
    totalAmount: string;
    createdAt: string;
  } | null;
}

type PendingAction = "approve" | "send" | "negotiate" | "approve-client" | "convert" | "expire";

const ACTION_COPY: Record<
  PendingAction,
  { title: string; description: string; label: string; variant: "primary" | "danger" }
> = {
  approve: {
    title: "Liberar margem do orçamento?",
    description:
      "A liberação registra seu usuário como aprovador e devolve o orçamento para rascunho, pronto para envio.",
    label: "Liberar margem",
    variant: "primary",
  },
  send: {
    title: "Marcar orçamento como enviado?",
    description: "A proposta entra no funil de follow-up com a validade já calculada.",
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
      "Use apenas após o aceite formal. O orçamento ficará disponível para conversão em pedido.",
    label: "Cliente aprovou",
    variant: "primary",
  },
  convert: {
    title: "Converter em pedido de venda?",
    description:
      "O pedido será criado como «aguardando produção» e os retalhos reservados serão consumidos.",
    label: "Gerar pedido",
    variant: "primary",
  },
  expire: {
    title: "Marcar orçamento como expirado?",
    description: "Encerra a proposta fora da validade e libera eventuais retalhos reservados.",
    label: "Marcar expirado",
    variant: "danger",
  },
};

export interface QuoteDetailClientProps {
  data: QuoteDetailData;
  canWrite: boolean;
  canApproveMargin: boolean;
  canEdit: boolean;
}

export function QuoteDetailClient({
  data,
  canWrite,
  canApproveMargin,
  canEdit,
}: QuoteDetailClientProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"itens" | "custos" | "comercial">("itens");
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [lostOpen, setLostOpen] = React.useState(false);
  const [lossReason, setLossReason] = React.useState<string>(LOSS_REASONS[0]);
  const [lossNote, setLossNote] = React.useState("");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  const status = data.status;
  const closed = ["aprovado", "perdido", "expirado"].includes(status);
  const netTotal = data.items.reduce((sum, item) => sum + Number(item.netWeightKg), 0);
  const grossTotal = data.items.reduce((sum, item) => sum + Number(item.grossWeightKg), 0);
  const totalCost = data.totalMaterialCost + data.totalProcessCost;

  async function runStatus(next: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/quotes/${data.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Não foi possível atualizar o status.");
    return json;
  }

  async function confirmAction(action: PendingAction) {
    setBusy(true);
    try {
      if (action === "approve") {
        const res = await fetch(`/api/quotes/${data.id}/approve-margin`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Falha ao liberar margem.");
        toast.success("Margem liberada pelo diretor.");
      } else if (action === "convert") {
        const res = await fetch(`/api/quotes/${data.id}/convert-to-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Falha ao gerar pedido.");
        toast.success("Pedido de venda criado.");
      } else {
        const map: Record<string, string> = {
          send: "enviado",
          negotiate: "em_negociacao",
          "approve-client": "aprovado",
          expire: "expirado",
        };
        await runStatus(map[action]);
        toast.success("Status atualizado.");
      }
      setPending(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLost() {
    const reason = lossReason === "Outro" && lossNote.trim() ? lossNote.trim() : lossReason;
    if (!reason.trim()) {
      toast.error("Informe o motivo da perda.");
      return;
    }
    setBusy(true);
    try {
      await runStatus("perdido", { lossReason: reason });
      toast.success("Orçamento marcado como perdido.");
      setLostOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOrderCancellation() {
    if (cancelReason.trim().length < 5) {
      toast.error("Informe justificativa com ao menos 5 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/stock/orders/${data.salesOrder?.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao cancelar pedido.");
      toast.success(`Pedido cancelado; ${result.releasedReservations} reserva(s) liberada(s).`);
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao cancelar pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePdf() {
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/quotes/${data.id}/generate-pdf`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao gerar PDF.");
      toast.success("PDF da proposta gerado.");
      window.open(json.url, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  const primaryActions: Array<{ action: PendingAction; label: string }> = [];
  if (status === "rascunho" && canWrite)
    primaryActions.push({ action: "send", label: "Marcar enviado" });
  if (status === "enviado" && canWrite)
    primaryActions.push({ action: "negotiate", label: "Em negociação" });
  if (status === "em_negociacao" && canWrite)
    primaryActions.push({ action: "approve-client", label: "Cliente aprovou" });
  if (status === "aprovado" && canWrite && !data.salesOrder)
    primaryActions.push({ action: "convert", label: "Gerar pedido" });

  return (
    <div className="flex flex-col gap-space-md pb-4">
      <Breadcrumbs
        items={[
          { label: "Vendas & Orçamentos", href: "/vendas/orcamentos" },
          { label: "Orçamentos", href: "/vendas/orcamentos" },
          { label: data.quoteNumberLabel },
        ]}
      />

      {/* HEADER */}
      <div className="flex flex-col gap-space-md rounded border border-carbon-700/80 bg-carbon-900 p-space-md xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-ice-white">
              {data.quoteNumberLabel}
            </h1>
            <StatusBadge status={status} label={data.statusLabel} />
            {data.expired && status !== "expirado" && (
              <span className="inline-flex items-center gap-1 rounded border border-signal-hold/40 bg-signal-hold/10 px-2 py-0.5 font-label-code text-label-code text-signal-hold">
                <Clock className="h-3 w-3" /> Fora da validade
              </span>
            )}
            {data.salesOrder && (
              <span className="inline-flex items-center gap-1 rounded border border-signal-buy/40 bg-signal-buy/10 px-2 py-0.5 font-label-code text-label-code text-signal-buy">
                <ShoppingCart className="h-3 w-3" /> Pedido #{data.salesOrder.orderNumber}
              </span>
            )}
          </div>
          <p className="font-body-md text-body-md text-titanium-light">
            {data.customer.tradeName || data.customer.legalName}
            <span className="text-titanium-muted"> · {data.customer.document}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-label-code text-label-code text-titanium-muted">
            <span>
              Canal:{" "}
              <span className="text-titanium-light">
                {QUOTE_CHANNEL_LABELS[data.channel as QuoteChannel] ?? data.channel}
              </span>
            </span>
            <span>
              Vendedor: <span className="text-titanium-light">{data.sellerName ?? "—"}</span>
            </span>
            <span>
              Emitido: <span className="text-titanium-light">{formatDateTime(data.createdAt)}</span>
            </span>
            <span>
              Validade:{" "}
              <span className="text-titanium-light">{formatDateTime(data.validUntil)}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={generatePdf} disabled={pdfBusy}>
            {pdfBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Gerar PDF
          </Button>
          {data.pdfFileKey && (
            <a
              href={`/api/files/download?key=${encodeURIComponent(data.pdfFileKey)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="md">
                <Download className="mr-2 h-4 w-4" /> Último PDF
              </Button>
            </a>
          )}
          {canEdit && (status === "rascunho" || status === "bloqueado_margem") && (
            <Link href={`/vendas/orcamentos/${data.id}/editar`}>
              <Button variant="secondary" size="md">
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
            </Link>
          )}
          {primaryActions.map((entry) => (
            <Button
              key={entry.action}
              variant="primary"
              size="md"
              disabled={busy}
              onClick={() => setPending(entry.action)}
            >
              {entry.action === "convert" ? (
                <ShoppingCart className="mr-2 h-4 w-4" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {entry.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ALERTS */}
      {status === "bloqueado_margem" && (
        <div className="flex flex-col items-start justify-between gap-3 rounded border-y border-r border-l-4 border-carmine-core border-carbon-700/70 bg-carbon-900 p-space-sm px-space-md sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldAlert className="h-5 w-5 shrink-0 text-carmine-signal" />
            <p className="font-body-sm text-body-sm text-titanium-light">
              <strong className="uppercase text-carmine-signal">Bloqueio de margem:</strong> a
              proposta está abaixo da margem mínima de {formatNumberBR(data.minMarginPct, 2)}% ou do
              custo de reposição. Somente o diretor pode liberar.
            </p>
          </div>
          {canApproveMargin && (
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => setPending("approve")}
            >
              <Lock className="mr-1 h-3 w-3" /> Liberar margem
            </Button>
          )}
        </div>
      )}

      {status === "perdido" && data.lossReason && (
        <div className="rounded border border-carbon-700/70 bg-carbon-900 p-space-sm px-space-md">
          <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
            Motivo da perda
          </p>
          <p className="mt-1 font-body-sm text-body-sm text-titanium-light">{data.lossReason}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-space-md lg:grid-cols-4">
        <Kpi label="TOTAL DA PROPOSTA" value={formatCurrencyBRL(data.totalAmount)} tone="default" />
        <Kpi
          label="MARGEM BRUTA"
          value={`${formatNumberBR(data.grossMarginPct, 2)}%`}
          tone={
            data.grossMarginPct < data.minMarginPct
              ? "risk"
              : data.grossMarginPct < data.minMarginPct + 3
                ? "hold"
                : "buy"
          }
          hint={`Política ${formatNumberBR(data.minMarginPct, 2)}%`}
        />
        <Kpi
          label="PESO LÍQUIDO"
          value={`${formatNumberBR(netTotal, 3)} kg`}
          tone="default"
          hint={`Bruto ${formatNumberBR(grossTotal, 3)} kg`}
        />
        <Kpi
          label="VALIDADE"
          value={`${validityHours(data.createdAt, data.validUntil)} h`}
          tone={data.expired ? "risk" : "default"}
          hint={`Volatilidade semanal ${formatNumberBR(data.marketVolatilityPct, 2)}% · ${
            data.marketSymbol ?? "—"
          }`}
        />
      </div>

      {/* TABS */}
      <div className="rounded border border-carbon-700/80 bg-carbon-900">
        <div
          role="tablist"
          className="flex items-center gap-5 border-b border-carbon-800 px-space-md pt-2"
        >
          {(
            [
              { key: "itens", label: `Itens (${data.items.length})` },
              { key: "custos", label: "Composição de custo" },
              { key: "comercial", label: "Condições comerciais" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.key}
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={`-mb-px border-b-2 px-0.5 pb-2 pt-1 text-body-md transition-colors ${
                tab === entry.key
                  ? "border-carmine-core font-medium text-ice-white"
                  : "border-transparent text-titanium-muted hover:text-ice-white"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === "itens" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th className="px-3 py-2">SKU / Especificação</th>
                  <th className="px-2 py-2">Geometria</th>
                  <th className="px-2 py-2">Processo</th>
                  <th className="px-2 py-2 text-right">Qtd</th>
                  <th className="px-2 py-2 text-right">Peso líq.</th>
                  <th className="px-2 py-2 text-right">Peso bruto</th>
                  <th className="px-2 py-2 text-right">Unitário</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {data.items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-carbon-800/40">
                    <td className="px-3 py-2">
                      <div className="font-label-code text-label-code font-semibold text-ice-white">
                        {item.sku}
                      </div>
                      <div className="text-[10px] text-titanium-muted">
                        {item.description} · {item.norm}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-label-code text-label-code text-titanium-light">
                      {geometryLabel(item)}
                    </td>
                    <td className="px-2 py-2 font-label-code text-label-code text-titanium-light">
                      {item.processType
                        ? (PROCESS_LABELS[item.processType as keyof typeof PROCESS_LABELS] ??
                          item.processType)
                        : "—"}
                      {item.machineName ? (
                        <span className="block text-[10px] text-titanium-muted">
                          {item.machineName}
                        </span>
                      ) : null}
                      {item.remnantCode ? (
                        <span className="block text-[10px] text-signal-buy">
                          Retalho {item.remnantCode}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                      {formatNumberBR(item.netWeightKg, 3)} kg
                    </td>
                    <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-muted">
                      {formatNumberBR(item.grossWeightKg, 3)} kg
                    </td>
                    <td className="px-2 py-2 text-right font-label-code text-label-code text-ice-white">
                      {formatCurrencyBRL(item.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-right font-label-code text-label-code font-bold text-ice-white">
                      {formatCurrencyBRL(item.totalItemAmount)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right font-label-code text-label-code ${marginTextClass(
                        Number(item.itemMarginPct),
                        data.minMarginPct
                      )}`}
                    >
                      {formatNumberBR(item.itemMarginPct, 2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "custos" && (
          <div className="grid grid-cols-1 gap-space-md p-space-md lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto rounded border border-carbon-700/60">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-2 py-2 text-right">Reposição/kg</th>
                    <th className="px-2 py-2 text-right">Venda/kg</th>
                    <th className="px-2 py-2 text-right">Sucata</th>
                    <th className="px-2 py-2 text-right">Custo mat.</th>
                    <th className="px-2 py-2 text-right">Custo proc.</th>
                    <th className="px-2 py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon-800/80">
                  {data.items.map((item) => {
                    const net = Number(item.netWeightKg);
                    const salePerKg = net > 0 ? Number(item.totalItemAmount) / net : 0;
                    const material = Number(item.unitMaterialCost) * item.quantity;
                    const process = Number(item.unitProcessCost) * item.quantity;
                    return (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-label-code text-label-code text-titanium-light">
                          {item.sku}
                          <span className="block text-[10px] text-titanium-muted">
                            {geometryLabel(item)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                          {formatCurrencyBRL(item.replacementCostPerKg)}
                        </td>
                        <td className="px-2 py-2 text-right font-label-code text-label-code text-ice-white">
                          {formatCurrencyBRL(salePerKg)}
                        </td>
                        <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-muted">
                          {formatNumberBR(item.scrapPct, 2)}%
                        </td>
                        <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                          {formatCurrencyBRL(material)}
                        </td>
                        <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                          {formatCurrencyBRL(process)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right font-label-code text-label-code ${marginTextClass(
                            Number(item.itemMarginPct),
                            data.minMarginPct
                          )}`}
                        >
                          {formatNumberBR(item.itemMarginPct, 2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded border border-carbon-700/60 bg-carbon-950 p-3">
              <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
                Formação do preço
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <SummaryRow label="Material" value={formatCurrencyBRL(data.totalMaterialCost)} />
                <SummaryRow
                  label="Processo / máquina"
                  value={formatCurrencyBRL(data.totalProcessCost)}
                />
                <SummaryRow label="Frete" value={formatCurrencyBRL(data.totalFreightCost)} />
                <SummaryRow
                  label="Serviços de terceiros"
                  value={formatCurrencyBRL(data.totalServicesCost)}
                />
                <div className="my-1 border-t border-carbon-800" />
                <SummaryRow label="Custo total" value={formatCurrencyBRL(totalCost)} />
                <SummaryRow
                  label="Total da proposta"
                  value={formatCurrencyBRL(data.totalAmount)}
                  strong
                />
                <SummaryRow
                  label="Margem bruta"
                  value={`${formatNumberBR(data.grossMarginPct, 2)}%`}
                  strong
                />
              </div>
            </div>
          </div>
        )}

        {tab === "comercial" && (
          <div className="grid grid-cols-1 gap-space-md p-space-md sm:grid-cols-2">
            <InfoBlock label="Condição de pagamento" value={data.paymentTerms || "A combinar"} />
            <InfoBlock label="Modalidade de entrega" value={data.deliveryMethod || "A combinar"} />
            <InfoBlock
              label="Prazo de entrega"
              value={data.deliveryDeadline ? formatDate(data.deliveryDeadline) : "A combinar"}
            />
            <InfoBlock label="Dados bancários / PIX" value={data.bankingInfo || "—"} />
            <InfoBlock
              label="Cliente"
              value={`${data.customer.legalName} · ${data.customer.document}`}
            />
            <InfoBlock
              label="Contato"
              value={
                [data.customer.contacts?.contactName, data.customer.contacts?.phone]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
            <InfoBlock
              label="Margem alvo / desconto"
              value={`${formatNumberBR(data.targetMarginPct, 2)}% · ${formatNumberBR(
                data.discountPct,
                2
              )}%`}
            />
            <InfoBlock
              label="Liberação de margem"
              value={
                data.approvedByDirectorId
                  ? `Liberada em ${data.approvedAt ? formatDateTime(data.approvedAt) : "—"}`
                  : "Não houve necessidade"
              }
            />
            <div className="sm:col-span-2">
              <InfoBlock label="Observações" value={data.notes || "—"} />
            </div>
            {data.salesOrder && (
              <div className="sm:col-span-2 rounded border border-signal-buy/40 bg-signal-buy/10 p-3">
                <p className="flex items-center gap-1.5 font-label-caps text-label-caps uppercase text-signal-buy">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Pedido de venda gerado
                </p>
                <p className="mt-1 font-label-code text-label-code text-titanium-light">
                  Pedido #{data.salesOrder.orderNumber} · Status{" "}
                  {orderStatusLabel(data.salesOrder.orderStatus)} ·{" "}
                  {formatCurrencyBRL(data.salesOrder.totalAmount)} ·{" "}
                  {formatDateTime(data.salesOrder.createdAt)}
                </p>
                {canWrite &&
                  ["aguardando_producao", "em_corte"].includes(data.salesOrder.orderStatus) && (
                    <Button
                      className="mt-3"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setCancelOpen(true)}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Cancelar pedido
                    </Button>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AÇÕES SECUNDÁRIAS */}
      {canWrite && !closed && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status === "bloqueado_margem" && !canApproveMargin && (
            <span className="mr-auto flex items-center gap-1.5 font-label-code text-label-code text-signal-hold">
              <AlertTriangle className="h-3.5 w-3.5" /> Aguardando liberação do diretor
            </span>
          )}
          {data.expired && status !== "expirado" && (
            <Button
              variant="secondary"
              size="md"
              disabled={busy}
              onClick={() => setPending("expire")}
            >
              <Clock className="mr-2 h-4 w-4" /> Marcar expirado
            </Button>
          )}
          <Button variant="danger" size="md" disabled={busy} onClick={() => setLostOpen(true)}>
            <XCircle className="mr-2 h-4 w-4" /> Registrar perda
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pending}
        title={pending ? ACTION_COPY[pending].title : ""}
        description={pending ? ACTION_COPY[pending].description : ""}
        confirmLabel={pending ? ACTION_COPY[pending].label : "Confirmar"}
        variant={pending ? ACTION_COPY[pending].variant : "primary"}
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && confirmAction(pending)}
      />

      <FormDrawer
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar pedido de venda"
        subtitle="Reservas ativas serão liberadas. Histórico do pedido permanece auditável."
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              variant="danger"
              onClick={submitOrderCancellation}
              disabled={busy || cancelReason.trim().length < 5}
            >
              {busy ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <label
            className="font-label-caps text-label-caps uppercase text-titanium-muted"
            htmlFor="order-cancel-reason"
          >
            Justificativa obrigatória
          </label>
          <textarea
            id="order-cancel-reason"
            className="min-h-28 rounded border border-carbon-700 bg-carbon-950 p-3 text-ice-white"
            maxLength={1000}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Descreva o motivo do cancelamento (mínimo 5 caracteres)…"
          />
        </div>
      </FormDrawer>

      <FormDrawer
        isOpen={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Registrar perda da proposta"
        subtitle="O motivo é obrigatório para alimentar a análise de conversão"
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLostOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={submitLost} disabled={busy}>
              {busy ? "Registrando…" : "Confirmar perda"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted">
              Motivo da perda
            </label>
            <SelectMenu
              value={lossReason}
              onChange={setLossReason}
              options={LOSS_REASONS.map((reason) => ({ value: reason, label: reason }))}
              aria-label="Motivo da perda"
            />
          </div>
          {lossReason === "Outro" && (
            <div>
              <label className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted">
                Descreva o motivo
              </label>
              <Input
                value={lossNote}
                onChange={(event) => setLossNote(event.target.value)}
                placeholder="Ex.: cliente fechou com fornecedor local"
              />
            </div>
          )}
          <p className="text-body-sm text-titanium-muted">
            A proposta será encerrada como perdida e os retalhos reservados voltam ao estoque.
          </p>
        </div>
      </FormDrawer>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const className =
    status === "aprovado"
      ? "border-signal-buy/40 bg-signal-buy/15 text-signal-buy"
      : status === "bloqueado_margem"
        ? "border-carmine-core/50 bg-carmine-core/20 font-bold text-carmine-signal"
        : status === "enviado"
          ? "border-tertiary/40 bg-tertiary/15 text-tertiary"
          : status === "em_negociacao"
            ? "border-signal-hold/40 bg-signal-hold/15 text-signal-hold"
            : "border-carbon-700 bg-carbon-800 text-titanium-light";

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-label-code text-label-code ${className}`}
    >
      {label}
    </span>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "default" | "risk" | "hold" | "buy";
  hint?: string;
}) {
  const toneClass =
    tone === "risk"
      ? "text-carmine-signal"
      : tone === "hold"
        ? "text-signal-hold"
        : tone === "buy"
          ? "text-signal-buy"
          : "text-ice-white";

  return (
    <div className="rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
      <p className="font-label-caps text-label-caps uppercase text-titanium-muted">{label}</p>
      <p className={`mt-1 font-metric-display text-metric-display font-bold ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 font-label-code text-label-code text-titanium-muted">{hint}</p>}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between font-body-sm text-body-sm">
      <span className="text-titanium-muted">{label}</span>
      <span
        className={
          strong
            ? "font-label-code text-label-code font-bold text-ice-white"
            : "font-label-code text-label-code text-titanium-light"
        }
      >
        {value}
      </span>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-carbon-700/60 bg-carbon-950 p-3">
      <p className="font-label-caps text-label-caps uppercase text-titanium-muted">{label}</p>
      <p className="mt-1 font-body-sm text-body-sm text-titanium-light">{value}</p>
    </div>
  );
}

function marginTextClass(margin: number, minMargin: number): string {
  if (margin < minMargin) return "text-carmine-signal font-bold";
  if (margin < minMargin + 3) return "text-signal-hold font-semibold";
  return "text-signal-buy font-semibold";
}

function validityHours(createdAt: string, validUntil: string): number {
  const diff = new Date(validUntil).getTime() - new Date(createdAt).getTime();
  return Math.max(1, Math.round(diff / 3_600_000));
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function geometryLabel(item: QuoteDetailItem): string {
  const n = (value: string | null, digits = 2) =>
    value == null ? null : formatNumberBR(value, digits);

  switch (item.geometryType) {
    case "CHAPA_RETANGULAR":
      return `${n(item.lengthMm) ?? "?"} × ${n(item.widthMm) ?? "?"} × ${
        n(item.thicknessMm) ?? "?"
      } mm`;
    case "DISCO":
      return [
        `Ø ${n(item.diameterMm) ?? "?"} mm`,
        item.innerDiameterMm ? `furo Ø ${n(item.innerDiameterMm)} mm` : null,
        n(item.thicknessMm) ? `${n(item.thicknessMm)} mm` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "BARRA_CORTE":
      return `Ø ${n(item.diameterMm) ?? "?"} mm · corte ${n(item.lengthMm) ?? "?"} mm`;
    case "TUBO_CORTE":
      return `Ø ${n(item.diameterMm) ?? "?"} mm · parede ${n(item.wallMm) ?? "?"} mm · corte ${
        n(item.lengthMm) ?? "?"
      } mm`;
    default:
      return "Produto de catálogo";
  }
}
