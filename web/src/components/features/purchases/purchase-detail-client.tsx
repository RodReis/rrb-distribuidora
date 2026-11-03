"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FileWarning,
  MessageSquare,
  PackageCheck,
  PackagePlus,
  Pencil,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { MetricTile, type MetricTone } from "@/components/shared/metric-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { cn, formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import {
  canReceive,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_TONE,
} from "@/lib/purchases/state-machine";
import type {
  PurchaseApprovalDto,
  PurchaseCapability,
  PurchaseOrderDetail,
  PurchaseReceiptDto,
  PurchaseStatus,
} from "@/lib/purchases/types";

import { PurchaseApprovalPanel } from "./purchase-approval-panel";
import { PurchaseTimeline } from "./purchase-timeline";
import {
  PurchaseCancelDialog,
  PurchaseReasonDialog,
  PurchaseReverseDialog,
} from "./purchase-cancel-dialog";
import { PurchaseReceiptDrawer, type PurchaseWarehouseOption } from "./purchase-receipt-drawer";
import { PurchaseFollowUpForm } from "./purchase-followup-form";
import {
  apiErrorFromBody,
  APPROVAL_DECISION_LABEL,
  formatDateBR,
  formatDateTimeBR,
  formatQuantityWithUnit,
  newIdempotencyKey,
  parseJsonSafe,
  receivedPercentage,
  shortHash,
  type PurchaseDetailTab,
} from "./purchase-detail-utils";

/**
 * Tela de detalhe do pedido de compra (LAC-01 §8) — itens, aprovações, timeline,
 * recebimentos e documento.
 *
 * A UI nunca decide estado: cada botão só aparece quando estado + capability
 * permitem e toda mutação chama a API, que revalida hash, alçada, segregação e
 * idempotência no servidor. Após sucesso, o pedido devolvido substitui o estado
 * local e um `router.refresh()` sincroniza recebimentos/derivados.
 */

const APPROVAL_CONFIG_HREF = "/configuracoes?tab=compras";

const SUBMITTABLE_STATUSES: readonly PurchaseStatus[] = [
  "rascunho",
  "rejeitado",
  "aguardando_alcada_configurada",
];

// Edição exposta na UI só enquanto a aprovação ainda não foi dada: editar um
// pedido aprovado invalidaria a aprovação, então a tela exige cancelar/refazer.
const EDITABLE_UI_STATUSES: readonly PurchaseStatus[] = [
  "rascunho",
  "rejeitado",
  "aguardando_alcada_configurada",
];

const CANCELABLE_STATUSES: readonly PurchaseStatus[] = [
  "submetido",
  "aprovado",
  "emitido",
  "parcialmente_recebido",
  "aguardando_alcada_configurada",
];

const FOLLOW_UP_STATUSES: readonly PurchaseStatus[] = [
  "emitido",
  "parcialmente_recebido",
  "recebido_completo",
];

type ConfirmationKind = "submit" | "approve" | "issue" | "delete";

const CONFIRMATION_COPY: Record<
  ConfirmationKind,
  {
    title: string;
    description: (detail: PurchaseOrderDetail) => string;
    confirmLabel: string;
    variant: "primary" | "danger";
  }
> = {
  submit: {
    title: "Submeter pedido para aprovação?",
    description: (detail) =>
      `A versão v${detail.order.currentVersion} será congelada e enviada à alçada configurada. Edições posteriores exigem nova submissão e nova aprovação.`,
    confirmLabel: "Submeter para aprovação",
    variant: "primary",
  },
  approve: {
    title: "Aprovar pedido de compra?",
    description: (detail) =>
      `Aprovar a versão v${detail.order.currentVersion} no total de ${formatCurrencyBRL(
        detail.order.grandTotal
      )}? A aprovação fica vinculada ao hash exato do conteúdo e libera a emissão.`,
    confirmLabel: "Aprovar pedido",
    variant: "primary",
  },
  issue: {
    title: "Emitir pedido ao fornecedor?",
    description: (detail) =>
      `A emissão gera o número interno definitivo e o PDF do pedido ${detail.supplier.legalName}. Depois de emitido, mudanças materiais exigem cancelamento e novo pedido.`,
    confirmLabel: "Emitir pedido",
    variant: "primary",
  },
  delete: {
    title: "Excluir rascunho do pedido?",
    description: (detail) =>
      `O rascunho ${detail.order.numberLabel} será excluído logicamente. O histórico permanece em auditoria e a ação não pode ser desfeita na tela.`,
    confirmLabel: "Excluir rascunho",
    variant: "danger",
  },
};

export interface PurchaseDetailClientProps {
  initialDetail: PurchaseOrderDetail;
  warehouses: PurchaseWarehouseOption[];
  isCreator: boolean;
  initialTab: PurchaseDetailTab;
}

export function PurchaseDetailClient({
  initialDetail,
  warehouses,
  isCreator,
  initialTab,
}: PurchaseDetailClientProps) {
  const router = useRouter();

  // Estado local espelha o pedido devolvido por cada mutação; o refresh do servidor
  // sincroniza recebimentos e agregados calculados fora da tela.
  const [detail, setDetail] = React.useState<PurchaseOrderDetail>(initialDetail);
  React.useEffect(() => {
    setDetail(initialDetail);
  }, [initialDetail]);

  const [confirmation, setConfirmation] = React.useState<ConfirmationKind | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [reverseTarget, setReverseTarget] = React.useState<PurchaseReceiptDto | null>(null);

  const order = detail.order;
  const status = order.status;
  const capabilities = React.useMemo(() => new Set(detail.capabilities), [detail.capabilities]);

  const approvalsRequired = detail.approvalRule?.requiredApprovals ?? null;
  const receivedPct = receivedPercentage(detail.items);
  const openItems = detail.items.filter((item) => item.quantityOpen > 0.00005);
  const openReceipts = detail.receipts.filter((receipt) => !receipt.reversedAt);
  const hasPdf = order.number !== null;
  const pdfHref = `/api/purchases/${order.id}/pdf`;

  const canEdit = capabilities.has("purchase.edit");
  const canSubmit = capabilities.has("purchase.submit");
  const canApprove = capabilities.has("purchase.approve");
  const canReject = capabilities.has("purchase.reject");
  const canIssue = capabilities.has("purchase.issue");
  const canFollowUp = capabilities.has("purchase.follow_up");
  const canCancel = capabilities.has("purchase.cancel");
  const canReceivePurchase = capabilities.has("stock.receive_purchase");
  const canDecide =
    !!detail.approvalRule &&
    capabilities.has(detail.approvalRule.approverPermission as PurchaseCapability);

  const canEditNow = canEdit && EDITABLE_UI_STATUSES.includes(status);
  const canSubmitNow = canSubmit && SUBMITTABLE_STATUSES.includes(status);
  const canDeleteNow = canEdit && status === "rascunho";
  const canIssueNow = canIssue && status === "aprovado";
  const canCancelNow = canCancel && CANCELABLE_STATUSES.includes(status);
  const canReceiveNow = canReceivePurchase && canReceive(status) && openItems.length > 0;
  const canFollowUpNow = canFollowUp && FOLLOW_UP_STATUSES.includes(status);
  const awaitingMyApproval = status === "submetido" && !isCreator && canDecide;
  const cancelBlockedByReceipts = canCancelNow && openReceipts.length > 0;

  const lastRejection: PurchaseApprovalDto | null =
    detail.approvals.find((approval) => approval.decision === "rejected") ?? null;
  const isOverdue =
    !!order.expectedDeliveryAt &&
    new Date(order.expectedDeliveryAt).getTime() < Date.now() &&
    !["recebido_completo", "cancelado", "rejeitado"].includes(status);

  function applyOrder(next: PurchaseOrderDetail) {
    setDetail(next);
    router.refresh();
  }

  async function postOrder(
    path: string,
    body: Record<string, unknown>
  ): Promise<PurchaseOrderDetail> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(apiErrorFromBody(parsed, response, "Não foi possível concluir a operação."));
    }
    const next = parsed?.order;
    if (!next || typeof next !== "object") {
      throw new Error("Resposta inesperada do servidor. Recarregue a tela.");
    }
    return next as unknown as PurchaseOrderDetail;
  }

  async function runOperation(key: string, task: () => Promise<void>) {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro inesperado ao processar a compra."
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitOrder() {
    await runOperation("submit", async () => {
      const next = await postOrder(`/api/purchases/${order.id}/submit`, {
        idempotencyKey: newIdempotencyKey(),
      });
      applyOrder(next);
      setConfirmation(null);
      if (next.order.status === "aguardando_alcada_configurada") {
        toast.warning(
          "Pedido submetido, mas não há faixa de alçada configurada. A emissão está bloqueada até configurar a matriz."
        );
      } else {
        toast.success(`Pedido submetido para aprovação (versão v${next.order.currentVersion}).`);
      }
    });
  }

  async function approveOrder() {
    await runOperation("approve", async () => {
      const next = await postOrder(`/api/purchases/${order.id}/decision`, {
        decision: "approved",
        idempotencyKey: newIdempotencyKey(),
      });
      applyOrder(next);
      setConfirmation(null);
      const required = next.approvalRule?.requiredApprovals ?? 1;
      if (next.order.status === "aprovado") {
        toast.success("Pedido aprovado. Emissão liberada.");
      } else {
        toast.success(
          `Aprovação registrada (${next.approvalsCount}/${required}). Aguardando os demais aprovadores.`
        );
      }
    });
  }

  async function rejectOrder(reason: string) {
    await runOperation("reject", async () => {
      const next = await postOrder(`/api/purchases/${order.id}/decision`, {
        decision: "rejected",
        justification: reason,
        idempotencyKey: newIdempotencyKey(),
      });
      applyOrder(next);
      setRejectOpen(false);
      toast.success("Pedido rejeitado. O comprador pode ajustar e submeter novamente.");
    });
  }

  async function issueOrder() {
    await runOperation("issue", async () => {
      // Chave gerada na confirmação explícita: repetir a requisição não cria 2º número/PDF.
      const next = await postOrder(`/api/purchases/${order.id}/issue`, {
        idempotencyKey: newIdempotencyKey(),
      });
      setDetail(next);
      setConfirmation(null);
      toast.success(
        `Pedido emitido como ${next.order.numberLabel}. O PDF do documento já está disponível.`
      );
      router.push(`/compras/${order.id}?tab=documento`);
    });
  }

  async function deleteDraft() {
    await runOperation("delete", async () => {
      const response = await fetch(`/api/purchases/${order.id}`, { method: "DELETE" });
      const parsed = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(apiErrorFromBody(parsed, response, "Não foi possível excluir o rascunho."));
      }
      setConfirmation(null);
      toast.success("Rascunho excluído. Histórico mantido em auditoria.");
      router.push("/compras");
      router.refresh();
    });
  }

  async function cancelOrder(reason: string) {
    await runOperation("cancel", async () => {
      const next = await postOrder(`/api/purchases/${order.id}/cancel`, {
        reason,
        idempotencyKey: newIdempotencyKey(),
      });
      applyOrder(next);
      setCancelOpen(false);
      toast.success("Pedido cancelado. Emissão e recebimentos anteriores permanecem no histórico.");
    });
  }

  async function reverseReceipt(reason: string) {
    const target = reverseTarget;
    if (!target) return;
    await runOperation("reverse", async () => {
      const response = await fetch(`/api/purchases/receipts/${target.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, idempotencyKey: newIdempotencyKey() }),
      });
      const parsed = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(
          apiErrorFromBody(parsed, response, "Não foi possível estornar o recebimento.")
        );
      }
      setReverseTarget(null);
      toast.success(`Recebimento do lote ${target.lotNumber} estornado.`);
      router.refresh();
    });
  }

  function handleConfirm(kind: ConfirmationKind) {
    if (kind === "submit") void submitOrder();
    else if (kind === "approve") void approveOrder();
    else if (kind === "issue") void issueOrder();
    else void deleteDraft();
  }

  const hasHeaderActions =
    canEditNow ||
    canSubmitNow ||
    canDeleteNow ||
    canIssueNow ||
    canCancelNow ||
    canReceiveNow ||
    canFollowUpNow ||
    awaitingMyApproval ||
    hasPdf;

  const headerActions = hasHeaderActions ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canEditNow && (
        <Link href={`/compras/${order.id}/editar`}>
          <Button variant="secondary" size="md">
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Editar
          </Button>
        </Link>
      )}

      {canSubmitNow && (
        <Button
          variant="primary"
          size="md"
          disabled={busy !== null}
          onClick={() => setConfirmation("submit")}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden="true" /> Submeter
        </Button>
      )}

      {awaitingMyApproval && canApprove && (
        <Button
          variant="primary"
          size="md"
          disabled={busy !== null}
          onClick={() => setConfirmation("approve")}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Aprovar
        </Button>
      )}

      {awaitingMyApproval && canReject && (
        <Button
          variant="danger"
          size="md"
          disabled={busy !== null}
          onClick={() => setRejectOpen(true)}
        >
          <XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Rejeitar
        </Button>
      )}

      {canIssueNow && (
        <Button
          variant="primary"
          size="md"
          disabled={busy !== null || detail.versionDiverges}
          onClick={() => setConfirmation("issue")}
          title={
            detail.versionDiverges
              ? "A versão atual diverge da aprovada. Submeta e aprove novamente."
              : undefined
          }
        >
          <FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" /> Emitir
        </Button>
      )}

      {canReceiveNow && (
        <Button
          variant="primary"
          size="md"
          disabled={busy !== null}
          onClick={() => setReceiptOpen(true)}
        >
          <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" /> Receber item
        </Button>
      )}

      {canFollowUpNow && (
        <Button
          variant="secondary"
          size="md"
          disabled={busy !== null}
          onClick={() => setFollowUpOpen(true)}
        >
          <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" /> Follow-up
        </Button>
      )}

      {hasPdf && (
        <a href={pdfHref} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="md">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Baixar PDF
          </Button>
        </a>
      )}

      {canDeleteNow && (
        <Button
          variant="danger"
          size="md"
          disabled={busy !== null}
          onClick={() => setConfirmation("delete")}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Excluir
        </Button>
      )}

      {canCancelNow && (
        <Button
          variant="danger"
          size="md"
          disabled={busy !== null || cancelBlockedByReceipts}
          onClick={() => setCancelOpen(true)}
          title={
            cancelBlockedByReceipts
              ? "Estorne os recebimentos antes de cancelar o pedido."
              : undefined
          }
        >
          <Ban className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar
        </Button>
      )}
    </div>
  ) : undefined;

  const tabs: TabItem[] = [
    {
      key: "itens",
      label: "Itens",
      href: `/compras/${order.id}?tab=itens`,
      count: detail.items.length,
    },
    {
      key: "aprovacoes",
      label: "Aprovações",
      href: `/compras/${order.id}?tab=aprovacoes`,
      count: detail.approvals.length,
    },
    {
      key: "timeline",
      label: "Timeline",
      href: `/compras/${order.id}?tab=timeline`,
      count: detail.events.length,
    },
    {
      key: "recebimentos",
      label: "Recebimentos",
      href: `/compras/${order.id}?tab=recebimentos`,
      count: detail.receipts.length,
    },
    { key: "documento", label: "Documento", href: `/compras/${order.id}?tab=documento` },
  ];

  const approvalTone: MetricTone =
    detail.approvalRule === null
      ? "risk"
      : status === "aprovado" ||
          status === "emitido" ||
          status === "parcialmente_recebido" ||
          status === "recebido_completo"
        ? "buy"
        : status === "submetido"
          ? "hold"
          : "neutral";

  return (
    <div className="flex flex-col gap-space-md">
      <PageHeader
        title={order.number !== null ? order.numberLabel : "Pedido de compra"}
        description={`${detail.supplier.tradeName || detail.supplier.legalName} · CNPJ ${detail.supplier.cnpj}`}
        badge={
          <StatusBadge
            tone={PURCHASE_STATUS_TONE[status]}
            label={PURCHASE_STATUS_LABEL[status]}
            pulse={false}
          />
        }
        actions={headerActions}
      />

      <PurchaseMeta detail={detail} isOverdue={isOverdue} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-space-md lg:grid-cols-4">
        <MetricTile
          label="Total geral"
          hint={`Moeda ${order.currency}`}
          value={formatCurrencyBRL(order.grandTotal)}
          footer={`Atualizado em ${formatDateTimeBR(order.updatedAt)}`}
        />
        <MetricTile
          label="Itens"
          value={detail.items.length}
          unit="itens"
          icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
          footer={`${openItems.length} com saldo aberto`}
        />
        <MetricTile
          label="Recebido"
          value={`${formatNumberBR(receivedPct, 1)}%`}
          tone={receivedPct >= 100 ? "buy" : receivedPct > 0 ? "hold" : "neutral"}
          footer={`${detail.receipts.filter((receipt) => !receipt.reversedAt).length} recebimento(s) válido(s)`}
        />
        <MetricTile
          label="Aprovações"
          value={`${detail.approvalsCount}/${approvalsRequired ?? "—"}`}
          tone={approvalTone}
          footer={
            detail.approvalRule
              ? `Matriz v${detail.approvalRule.matrixVersion} · versão v${order.currentVersion}`
              : "Alçada não configurada"
          }
        />
      </div>

      {/* AVISOS CONTEXTUAIS */}
      <div className="flex flex-col gap-space-sm">
        {status === "aguardando_alcada_configurada" && (
          <InlineNotice
            tone="risk"
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            title="Aguardando alçada configurada"
          >
            Não há faixa da matriz de alçadas para o total deste pedido, então ele não pode ser
            aprovado nem emitido.{" "}
            <Link
              href={APPROVAL_CONFIG_HREF}
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              Configurar matriz de alçadas
            </Link>
            .
          </InlineNotice>
        )}

        {status === "rejeitado" && lastRejection && (
          <InlineNotice
            tone="risk"
            icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
            title="Pedido rejeitado pela alçada"
          >
            <span className="block">
              {lastRejection.justification?.trim() || "Sem justificativa registrada."}
            </span>
            <span className="mt-1 block font-mono text-label-code text-titanium-muted">
              {APPROVAL_DECISION_LABEL[lastRejection.decision] ?? lastRejection.decision} por{" "}
              {lastRejection.actorName ?? "—"} em {formatDateTimeBR(lastRejection.decidedAt)} ·
              versão v{lastRejection.orderVersion}
            </span>
            <span className="mt-1 block">
              Ajuste o conteúdo e submeta novamente para gerar uma nova versão.
            </span>
          </InlineNotice>
        )}

        {detail.versionDiverges && (
          <InlineNotice
            tone="risk"
            icon={<FileWarning className="h-4 w-4" aria-hidden="true" />}
            title="Versão divergente da aprovada"
          >
            O conteúdo atual não corresponde ao hash da versão aprovada. Submeta e colete nova
            aprovação antes de emitir — a emissão está bloqueada enquanto a divergência existir.
          </InlineNotice>
        )}

        {status === "submetido" && isCreator && (
          <InlineNotice
            tone="hold"
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            title="Você criou este pedido"
          >
            A segregação de funções impede que o criador aprove ou rejeite o próprio pedido. A
            decisão precisa vir de outro aprovador ativo habilitado na faixa de alçada.
          </InlineNotice>
        )}

        {status === "submetido" && !isCreator && !detail.approvalRule && (
          <InlineNotice
            tone="risk"
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            title="Alçada não configurada"
          >
            Nenhuma faixa da matriz cobre o total de {formatCurrencyBRL(order.grandTotal)}, então a
            decisão está bloqueada.{" "}
            <Link
              href={APPROVAL_CONFIG_HREF}
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              Configurar matriz de alçadas
            </Link>
            .
          </InlineNotice>
        )}

        {status === "submetido" && !isCreator && detail.approvalRule && !canDecide && (
          <InlineNotice
            tone="hold"
            icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
            title="Fora da sua alçada"
          >
            Seu papel não está habilitado na faixa de valor deste pedido. A decisão precisa vir de
            um aprovador habilitado na matriz vigente.
          </InlineNotice>
        )}

        {status === "submetido" && awaitingMyApproval && (
          <InlineNotice
            tone="hold"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            title="Aguardando sua decisão"
          >
            Versão v{order.currentVersion} submetida com total de{" "}
            <span className="font-mono">{formatCurrencyBRL(order.grandTotal)}</span>.
            {detail.approvalRule
              ? ` A faixa exige ${detail.approvalRule.requiredApprovals} aprovação(ões) e já há ${detail.approvalsCount}.`
              : ""}
          </InlineNotice>
        )}

        {status === "aprovado" && !detail.versionDiverges && (
          <InlineNotice
            tone="buy"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            title="Aprovado, pronto para emissão"
          >
            A aprovação cobre exatamente a versão atual. Emita para gerar o número interno e o PDF
            do pedido ao fornecedor.
          </InlineNotice>
        )}

        {status === "cancelado" && order.cancellationReason && (
          <InlineNotice
            tone="neutral"
            icon={<Ban className="h-4 w-4" aria-hidden="true" />}
            title="Pedido cancelado"
          >
            <span className="block">{order.cancellationReason}</span>
            <span className="mt-1 block font-mono text-label-code text-titanium-muted">
              Cancelado em {formatDateTimeBR(order.cancelledAt)}
            </span>
          </InlineNotice>
        )}

        {cancelBlockedByReceipts && (
          <InlineNotice
            tone="hold"
            icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}
            title="Cancelamento bloqueado"
          >
            Há {openReceipts.length} recebimento(s) sem estorno. Estorne os recebimentos na aba
            Recebimentos antes de cancelar o pedido — o servidor também recusa essa transição.
          </InlineNotice>
        )}
      </div>

      {/* ABAS */}
      <div className="overflow-hidden rounded border border-carbon-700/80 bg-carbon-900">
        <div className="px-space-md pt-2">
          <Tabs items={tabs} active={initialTab} />
        </div>

        {initialTab === "itens" && <ItemsTab detail={detail} />}
        {initialTab === "aprovacoes" && (
          <div className="p-space-md">
            <PurchaseApprovalPanel detail={detail} />
          </div>
        )}
        {initialTab === "timeline" && (
          <div className="p-space-md">
            <PurchaseTimeline events={detail.events} items={detail.items} />
          </div>
        )}
        {initialTab === "recebimentos" && (
          <ReceiptsTab
            detail={detail}
            canReverse={canReceivePurchase}
            busy={busy !== null}
            onReverse={setReverseTarget}
          />
        )}
        {initialTab === "documento" && (
          <DocumentTab
            detail={detail}
            hasPdf={hasPdf}
            pdfHref={pdfHref}
            canIssueNow={canIssueNow && !detail.versionDiverges}
            onIssue={() => setConfirmation("issue")}
          />
        )}
      </div>

      {/* CONFIRMAÇÕES */}
      <ConfirmDialog
        isOpen={confirmation === "submit"}
        title={CONFIRMATION_COPY.submit.title}
        description={CONFIRMATION_COPY.submit.description(detail)}
        confirmLabel={CONFIRMATION_COPY.submit.confirmLabel}
        variant={CONFIRMATION_COPY.submit.variant}
        loading={busy === "submit"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => handleConfirm("submit")}
      />
      <ConfirmDialog
        isOpen={confirmation === "approve"}
        title={CONFIRMATION_COPY.approve.title}
        description={CONFIRMATION_COPY.approve.description(detail)}
        confirmLabel={CONFIRMATION_COPY.approve.confirmLabel}
        variant={CONFIRMATION_COPY.approve.variant}
        loading={busy === "approve"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => handleConfirm("approve")}
      />
      <ConfirmDialog
        isOpen={confirmation === "issue"}
        title={CONFIRMATION_COPY.issue.title}
        description={CONFIRMATION_COPY.issue.description(detail)}
        confirmLabel={CONFIRMATION_COPY.issue.confirmLabel}
        variant={CONFIRMATION_COPY.issue.variant}
        loading={busy === "issue"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => handleConfirm("issue")}
      />
      <ConfirmDialog
        isOpen={confirmation === "delete"}
        title={CONFIRMATION_COPY.delete.title}
        description={CONFIRMATION_COPY.delete.description(detail)}
        confirmLabel={CONFIRMATION_COPY.delete.confirmLabel}
        variant={CONFIRMATION_COPY.delete.variant}
        loading={busy === "delete"}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => handleConfirm("delete")}
      />

      <PurchaseReasonDialog
        key={rejectOpen ? "reject-open" : "reject-closed"}
        isOpen={rejectOpen}
        title="Rejeitar pedido de compra?"
        description={`A rejeição da versão v${order.currentVersion} devolve o pedido ao comprador, que pode ajustar o conteúdo e submeter novamente. O pedido não é cancelado.`}
        label="Justificativa da rejeição"
        placeholder="Ex.: preço acima do praticado pelo fornecedor na última compra"
        confirmLabel="Rejeitar pedido"
        loading={busy === "reject"}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(reason) => void rejectOrder(reason)}
      />

      <PurchaseCancelDialog
        key={cancelOpen ? "cancel-open" : "cancel-closed"}
        isOpen={cancelOpen}
        orderLabel={order.numberLabel}
        loading={busy === "cancel"}
        onCancel={() => setCancelOpen(false)}
        onConfirm={(reason) => void cancelOrder(reason)}
      />

      <PurchaseReverseDialog
        key={reverseTarget ? `reverse-${reverseTarget.id}` : "reverse-closed"}
        isOpen={reverseTarget !== null}
        receiptLabel={
          reverseTarget
            ? `${reverseTarget.lotNumber} · ${formatQuantityWithUnit(
                reverseTarget.quantity,
                reverseTarget.unit
              )}`
            : ""
        }
        loading={busy === "reverse"}
        onCancel={() => setReverseTarget(null)}
        onConfirm={(reason) => void reverseReceipt(reason)}
      />

      <PurchaseFollowUpForm
        key={followUpOpen ? "followup-open" : "followup-closed"}
        isOpen={followUpOpen}
        orderId={order.id}
        orderNumberLabel={order.numberLabel}
        currentExpectedDeliveryAt={order.expectedDeliveryAt}
        onClose={() => setFollowUpOpen(false)}
        onSaved={applyOrder}
      />

      <PurchaseReceiptDrawer
        key={receiptOpen ? "receipt-open" : "receipt-closed"}
        isOpen={receiptOpen}
        orderId={order.id}
        orderNumberLabel={order.numberLabel}
        items={detail.items}
        warehouses={warehouses}
        onClose={() => setReceiptOpen(false)}
        onReceived={() => router.refresh()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho de metadados
// ---------------------------------------------------------------------------

function PurchaseMeta({ detail, isOverdue }: { detail: PurchaseOrderDetail; isOverdue: boolean }) {
  const { order } = detail;

  return (
    <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-mono text-label-code text-titanium-muted">
      <span>
        Fornecedor:{" "}
        <span className="text-titanium-light">
          {detail.supplier.tradeName || detail.supplier.legalName}
        </span>
        {detail.supplier.city ? (
          <span className="text-titanium-muted">
            {" "}
            · {detail.supplier.city}
            {detail.supplier.uf ? `/${detail.supplier.uf}` : ""}
          </span>
        ) : null}
      </span>
      <span>
        Criado por <span className="text-titanium-light">{order.createdByName ?? "—"}</span> em{" "}
        {formatDateTimeBR(order.createdAt)}
      </span>
      <span>
        Previsão:{" "}
        <span className={isOverdue ? "font-semibold text-signal-risk" : "text-titanium-light"}>
          {order.expectedDeliveryAt ? formatDateBR(order.expectedDeliveryAt) : "não informada"}
          {isOverdue ? " · em atraso" : ""}
        </span>
      </span>
      <span>
        Versão <span className="text-titanium-light">v{order.currentVersion}</span>
      </span>
      {order.issuedAt && (
        <span>
          Emitido em <span className="text-titanium-light">{formatDateTimeBR(order.issuedAt)}</span>
        </span>
      )}
      {order.submittedAt && (
        <span>
          Submetido em{" "}
          <span className="text-titanium-light">{formatDateTimeBR(order.submittedAt)}</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Itens
// ---------------------------------------------------------------------------

function ItemsTab({ detail }: { detail: PurchaseOrderDetail }) {
  const { order, items } = detail;

  if (items.length === 0) {
    return (
      <div className="p-space-md">
        <EmptyState
          title="Nenhum item no pedido"
          description="Rascunhos sem itens não podem ser submetidos. Edite o pedido para incluir produtos."
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                SKU / descrição
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Qtd pedida
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Recebida
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Saldo aberto
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Preço unit.
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Desconto
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Custos adicionais
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-800/80">
            {items.map((item) => {
              const additionalTotal = item.additionalCosts.reduce(
                (total, cost) => total + Number(cost.amount),
                0
              );
              return (
                <tr key={item.id} className="transition-colors hover:bg-carbon-800/40">
                  <td className="px-3 py-2">
                    <div className="font-mono text-label-code font-semibold text-ice-white">
                      {item.sku}
                    </div>
                    <div className="text-[10px] text-titanium-muted">{item.description}</div>
                    {item.notes && (
                      <div className="mt-0.5 text-[10px] italic text-titanium-muted">
                        {item.notes}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-light">
                    {formatQuantityWithUnit(item.quantityOrdered, item.unit)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-muted">
                    {formatQuantityWithUnit(item.quantityReceived, item.unit)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-2 py-2 text-right font-mono text-label-code",
                      item.quantityOpen > 0.00005
                        ? "text-signal-hold"
                        : "font-semibold text-signal-buy"
                    )}
                  >
                    {formatQuantityWithUnit(item.quantityOpen, item.unit)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-ice-white">
                    {formatCurrencyBRL(item.unitPrice)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-light">
                    {item.discountAmount > 0 ? `− ${formatCurrencyBRL(item.discountAmount)}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-label-code text-titanium-light">
                    {item.additionalCosts.length === 0 ? (
                      "—"
                    ) : (
                      <>
                        <span className="block">+ {formatCurrencyBRL(additionalTotal)}</span>
                        <span className="block text-[10px] text-titanium-muted">
                          {item.additionalCosts.map((cost) => cost.description).join(" · ")}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code font-bold text-ice-white">
                    {formatCurrencyBRL(item.lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end border-t border-carbon-800 p-space-md">
        <dl className="w-full max-w-sm">
          <SummaryRow label="Subtotal" value={formatCurrencyBRL(order.subtotal)} />
          <SummaryRow label="Descontos" value={`− ${formatCurrencyBRL(order.discountTotal)}`} />
          <SummaryRow
            label="Custos adicionais"
            value={`+ ${formatCurrencyBRL(order.additionalCostsTotal)}`}
          />
          <div className="my-1 border-t border-carbon-800" />
          <SummaryRow label="Total geral" value={formatCurrencyBRL(order.grandTotal)} strong />
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Recebimentos
// ---------------------------------------------------------------------------

function ReceiptsTab({
  detail,
  canReverse,
  busy,
  onReverse,
}: {
  detail: PurchaseOrderDetail;
  canReverse: boolean;
  busy: boolean;
  onReverse: (receipt: PurchaseReceiptDto) => void;
}) {
  const { receipts } = detail;
  const validReceipts = receipts.filter((receipt) => !receipt.reversedAt);

  if (receipts.length === 0) {
    return (
      <div className="p-space-md">
        <EmptyState
          title="Nenhum recebimento registrado"
          description={
            canReceive(detail.order.status) || detail.order.status === "emitido"
              ? "Registre o recebimento pelo botão «Receber item». Cada recebimento cria lote e movimento de entrada vinculados a este pedido."
              : "Recebimentos contra o pedido aparecem aqui depois da emissão."
          }
          icon={<PackagePlus className="h-8 w-8" aria-hidden="true" />}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-carbon-800 px-space-md py-2">
        <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
          Recebimentos do pedido
        </p>
        <p className="font-mono text-label-code text-titanium-muted">
          {validReceipts.length} válido(s) · {receipts.length - validReceipts.length} estornado(s)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                Lote / item
              </th>
              <th scope="col" className="px-2 py-2">
                Depósito
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Quantidade
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Custo unit.
              </th>
              <th scope="col" className="px-2 py-2">
                Documento
              </th>
              <th scope="col" className="px-2 py-2">
                Recebedor
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Recebido em
              </th>
              <th scope="col" className="px-2 py-2">
                Status
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-800/80">
            {receipts.map((receipt) => {
              const reversed = !!receipt.reversedAt;
              return (
                <tr
                  key={receipt.id}
                  className={cn(
                    "transition-colors hover:bg-carbon-800/40",
                    reversed && "opacity-60"
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="font-mono text-label-code font-semibold text-ice-white">
                      {receipt.lotNumber}
                    </div>
                    <div className="text-[10px] text-titanium-muted">
                      {receipt.productDescription}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-titanium-light">{receipt.warehouseName}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-light">
                    {formatQuantityWithUnit(receipt.quantity, receipt.unit)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-light">
                    {formatCurrencyBRL(receipt.unitCost)}
                  </td>
                  <td className="px-2 py-2 font-mono text-label-code text-titanium-muted">
                    {receipt.supplierDocumentReference || "—"}
                  </td>
                  <td className="px-2 py-2 text-titanium-light">{receipt.receivedByName ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-label-code text-titanium-muted">
                    {formatDateTimeBR(receipt.receivedAt)}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge
                      tone={reversed ? "risk" : "buy"}
                      label={reversed ? "Estornado" : "Recebido"}
                      pulse={false}
                    />
                    {reversed && receipt.reversalReason && (
                      <p className="mt-1 max-w-[200px] text-[10px] text-titanium-muted">
                        {receipt.reversalReason}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {!reversed && canReverse ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onReverse(receipt)}
                      >
                        <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Estornar
                      </Button>
                    ) : (
                      <span className="font-mono text-label-code text-titanium-dark">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Documento
// ---------------------------------------------------------------------------

function DocumentTab({
  detail,
  hasPdf,
  pdfHref,
  canIssueNow,
  onIssue,
}: {
  detail: PurchaseOrderDetail;
  hasPdf: boolean;
  pdfHref: string;
  canIssueNow: boolean;
  onIssue: () => void;
}) {
  const { order, supplier } = detail;

  return (
    <div className="flex flex-col gap-space-md p-space-md">
      <InlineNotice
        tone="hold"
        icon={<FileWarning className="h-4 w-4" aria-hidden="true" />}
        title="Documento em homologação (LAC-12 pendente)"
      >
        O cadastro fiscal da distribuidora ainda não está concluído. O PDF é gerado com marca de
        homologação e não substitui documento fiscal; use-o apenas para conferência interna e envio
        ao fornecedor nesta fase.
      </InlineNotice>

      {!hasPdf ? (
        <EmptyState
          title="Pedido ainda não emitido"
          description={
            canIssueNow
              ? "A versão aprovada está pronta. Emita o pedido para gerar a numeração interna e o PDF do documento."
              : "O documento é gerado somente após a emissão de um pedido aprovado. Pedidos cancelados preservam o PDF da emissão original."
          }
          actionLabel={canIssueNow ? "Emitir pedido" : undefined}
          onAction={canIssueNow ? onIssue : undefined}
          icon={<FileText className="h-8 w-8" aria-hidden="true" />}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-carbon-800 bg-carbon-950/60 p-3">
            <div>
              <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
                Documento do pedido
              </p>
              <p className="mt-0.5 font-headline-sm text-headline-sm text-ice-white">
                {order.numberLabel}
              </p>
              <p className="mt-0.5 font-mono text-label-code text-titanium-muted">
                Emitido em {formatDateTimeBR(order.issuedAt)} · versão aprovada v
                {order.currentVersion} · hash {shortHash(order.approvedVersionHash)}
              </p>
            </div>
            <a href={pdfHref} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" size="md">
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Baixar PDF
              </Button>
            </a>
          </div>

          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3">
            <InfoBlock
              label="Fornecedor"
              value={`${supplier.legalName}${supplier.tradeName ? ` · ${supplier.tradeName}` : ""}`}
            />
            <InfoBlock label="CNPJ" value={supplier.cnpj} mono />
            <InfoBlock
              label="Cidade / UF"
              value={[supplier.city, supplier.uf].filter(Boolean).join(" / ") || "—"}
            />
            <InfoBlock
              label="Condição de pagamento"
              value={supplier.paymentTerms || "A combinar"}
            />
            <InfoBlock
              label="Previsão de entrega"
              value={order.expectedDeliveryAt ? formatDateBR(order.expectedDeliveryAt) : "—"}
              mono
            />
            <InfoBlock label="Criado por" value={order.createdByName ?? "—"} />
            <InfoBlock
              label="Versão / matriz de alçada"
              value={`v${order.currentVersion}${
                order.approvedRuleVersion !== null ? ` · matriz v${order.approvedRuleVersion}` : ""
              }`}
              mono
            />
            <InfoBlock
              label="Hash aprovado (curto)"
              value={shortHash(order.approvedVersionHash)}
              mono
            />
            <InfoBlock label="Total geral" value={formatCurrencyBRL(order.grandTotal)} mono />
          </div>

          {order.status === "cancelado" && (
            <InlineNotice
              tone="neutral"
              icon={<Ban className="h-4 w-4" aria-hidden="true" />}
              title="Pedido cancelado"
            >
              O PDF disponível é o documento da emissão original — o cancelamento não apaga o
              documento nem o histórico.
            </InlineNotice>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de apresentação
// ---------------------------------------------------------------------------

type NoticeTone = "risk" | "hold" | "buy" | "neutral";

const NOTICE_CLASS: Record<NoticeTone, string> = {
  risk: "border-signal-risk/40 bg-signal-risk/10 text-signal-risk",
  hold: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
  buy: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
  neutral: "border-carbon-700 bg-carbon-800 text-titanium-muted",
};

function InlineNotice({
  tone,
  icon,
  title,
  children,
}: {
  tone: NoticeTone;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded border p-3", NOTICE_CLASS[tone])}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-label-caps text-label-caps uppercase">{title}</p>
        <div className="mt-0.5 font-body-sm text-body-sm text-titanium-light">{children}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="font-body-sm text-body-sm text-titanium-muted">{label}</dt>
      <dd
        className={cn(
          "text-right font-mono text-label-code",
          strong ? "font-bold text-ice-white" : "text-titanium-light"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border border-carbon-800 bg-carbon-950/60 p-3">
      <p className="font-label-caps text-label-caps uppercase text-titanium-muted">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-body-sm text-body-sm text-titanium-light",
          mono && "font-mono"
        )}
      >
        {value}
      </p>
    </div>
  );
}
