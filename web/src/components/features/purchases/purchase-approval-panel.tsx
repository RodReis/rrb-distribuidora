import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Settings2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrencyBRL } from "@/lib/utils";
import type { PurchaseApprovalDto, PurchaseOrderDetail } from "@/lib/purchases/types";
import {
  APPROVAL_DECISION_LABEL,
  approverPermissionLabel,
  formatDateTimeBR,
  roleLabel,
  shortHash,
} from "./purchase-detail-utils";

/**
 * Aba Aprovações (US-03/§5): faixa de alçada aplicada, avisos de divergência e o
 * histórico de decisões. A tela apenas lê — aprovar/rejeitar continua na API, que
 * revalida segredo de segregação, hash e matriz no servidor.
 */

const APPROVAL_CONFIG_HREF = "/configuracoes?tab=compras";

export interface PurchaseApprovalPanelProps {
  detail: PurchaseOrderDetail;
}

export function PurchaseApprovalPanel({ detail }: PurchaseApprovalPanelProps) {
  const { order, approvalRule, approvals, approvalsCount, versionDiverges } = detail;

  return (
    <div className="flex flex-col gap-space-md">
      {/* FAIXA DE ALÇADA APLICADA */}
      <section className="rounded border border-carbon-800 bg-carbon-950/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
              Faixa de alçada aplicada
            </p>
            {approvalRule ? (
              <p className="mt-0.5 font-body-md text-body-md text-titanium-light">
                Matriz v{approvalRule.matrixVersion} · vigente desde{" "}
                {formatDateTimeBR(approvalRule.activeFrom)}
              </p>
            ) : (
              <p className="mt-0.5 font-body-md text-body-md text-signal-hold">
                Alçada não configurada para o valor deste pedido
              </p>
            )}
          </div>
          <Link href={APPROVAL_CONFIG_HREF}>
            <Button variant="secondary" size="sm">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Configurar matriz de alçadas
            </Button>
          </Link>
        </div>

        {approvalRule ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <ApprovalField
              label="Faixa de valor"
              value={
                <span className="font-mono">
                  {formatCurrencyBRL(approvalRule.minTotal)}{" "}
                  {approvalRule.maxTotal === null
                    ? "ou mais"
                    : `a ${formatCurrencyBRL(approvalRule.maxTotal)}`}
                </span>
              }
            />
            <ApprovalField
              label="Aprovador exigido"
              value={approverPermissionLabel(approvalRule.approverPermission)}
            />
            <ApprovalField
              label="Aprovações exigidas"
              value={<span className="font-mono">{approvalRule.requiredApprovals}</span>}
            />
            <ApprovalField
              label="Aprovações válidas na versão"
              value={
                <span className="font-mono">
                  {approvalsCount}/{approvalRule.requiredApprovals}
                </span>
              }
            />
          </dl>
        ) : (
          <p className="mt-2 font-body-sm text-body-sm text-titanium-muted">
            O total de {formatCurrencyBRL(order.grandTotal)} não encontra faixa na matriz ativa. Sem
            faixa aplicável, o pedido não pode ser emitido — configure a matriz em Configurações ›
            Compras.
          </p>
        )}

        <p className="mt-3 border-t border-carbon-800 pt-2 font-body-sm text-body-sm text-titanium-muted">
          A aprovação vale para a versão{" "}
          <span className="font-mono text-titanium-light">v{order.currentVersion}</span> e o hash
          exato do conteúdo. Qualquer edição material invalida as aprovações e exige nova submissão.
        </p>
      </section>

      {/* AVISOS */}
      {versionDiverges && (
        <div className="flex items-start gap-2 rounded border border-signal-risk/40 bg-signal-risk/10 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-signal-risk" aria-hidden="true" />
          <p className="font-body-sm text-body-sm text-titanium-light">
            <strong className="uppercase text-signal-risk">Versão divergente:</strong> o conteúdo
            atual não corresponde ao hash da versão aprovada. Submeta o pedido novamente e colete
            uma nova aprovação antes de emitir.
          </p>
        </div>
      )}

      {!approvalRule && (
        <div className="flex items-start gap-2 rounded border border-signal-hold/40 bg-signal-hold/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-hold" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-body-sm text-body-sm text-titanium-light">
              <strong className="uppercase text-signal-hold">Alçada não configurada:</strong> a
              matriz versionada é obrigatória para decidir e emitir. Enquanto não houver faixa, o
              pedido fica bloqueado para aprovação e emissão.
            </p>
            <Link
              href={APPROVAL_CONFIG_HREF}
              className="font-mono text-label-code text-signal-hold underline underline-offset-2 transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              Configurar matriz de alçadas
            </Link>
          </div>
        </div>
      )}

      {/* HISTÓRICO */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
            Histórico de decisões
          </p>
          <p className="font-mono text-label-code text-titanium-muted">
            {approvals.length} decisão(ões) registrada(s)
          </p>
        </div>

        {approvals.length === 0 ? (
          <EmptyState
            title="Nenhuma decisão registrada"
            description="Quando um aprovador habilitado decidir, o registro aparece aqui com aprovador, papel, versão, hash e justificativa."
            icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
          />
        ) : (
          <div className="overflow-x-auto rounded border border-carbon-700/60">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Decisão
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Aprovador
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Papel
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Versão
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Hash
                  </th>
                  <th scope="col" className="px-2 py-2">
                    Justificativa
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {approvals.map((approval) => (
                  <ApprovalRow
                    key={approval.id}
                    approval={approval}
                    currentVersion={order.currentVersion}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ApprovalRow({
  approval,
  currentVersion,
}: {
  approval: PurchaseApprovalDto;
  currentVersion: number;
}) {
  const isCurrentVersion = approval.orderVersion === currentVersion;

  return (
    <tr className="transition-colors hover:bg-carbon-800/40">
      <td className="px-3 py-2">
        <StatusBadge
          tone={approval.decision === "approved" ? "buy" : "risk"}
          label={APPROVAL_DECISION_LABEL[approval.decision] ?? approval.decision}
          pulse={false}
        />
      </td>
      <td className="px-2 py-2 text-titanium-light">{approval.actorName ?? "—"}</td>
      <td className="px-2 py-2 text-titanium-light">{roleLabel(approval.actorRole)}</td>
      <td className="px-2 py-2 text-right font-mono text-label-code text-titanium-light">
        v{approval.orderVersion}
        {!isCurrentVersion && (
          <span className="block text-[10px] text-titanium-muted">versão anterior</span>
        )}
      </td>
      <td
        className="px-2 py-2 font-mono text-label-code text-titanium-muted"
        title="Hash do conteúdo aprovado (forma curta)"
      >
        {shortHash(approval.contentHash)}
      </td>
      <td className="max-w-[280px] px-2 py-2 text-titanium-light [overflow-wrap:anywhere]">
        {approval.justification?.trim() || "—"}
      </td>
      <td className="px-2 py-2 text-right font-mono text-label-code text-titanium-muted">
        {formatDateTimeBR(approval.decidedAt)}
      </td>
    </tr>
  );
}

function ApprovalField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-label-caps text-label-caps uppercase text-titanium-muted">{label}</dt>
      <dd className="mt-0.5 font-body-sm text-body-sm text-titanium-light">{value}</dd>
    </div>
  );
}
