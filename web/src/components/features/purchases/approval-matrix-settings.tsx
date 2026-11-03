"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Plus, Save, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { formatCurrencyBRL } from "@/lib/utils";
import type { PurchaseApprovalRuleDto } from "@/lib/purchases/types";

export interface ApprovalMatrixVersion {
  version: number;
  activeFrom: string;
  activeUntil: string | null;
  rows: PurchaseApprovalRuleDto[];
}

export interface ApprovalMatrixHistory {
  activeVersion: number | null;
  versions: ApprovalMatrixVersion[];
}

export interface ApprovalMatrixSettingsProps {
  canConfigure: boolean;
  history: ApprovalMatrixHistory | null;
}

interface RowState {
  key: string;
  minTotal: number | null;
  requiredApprovals: number;
}

const APPROVERS_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({
  value: String(value),
  label: value === 1 ? "1 aprovador" : `${value} aprovadores`,
}));

const FIELD_LABEL = "font-label-caps text-label-caps uppercase tracking-wider text-titanium-muted";

let rowSeq = 0;
function nextRowKey(): string {
  rowSeq += 1;
  return `row-${Date.now().toString(36)}-${rowSeq}`;
}

function rowsFromVersion(version: ApprovalMatrixVersion | null): RowState[] {
  if (!version || version.rows.length === 0) {
    return [{ key: nextRowKey(), minTotal: 0, requiredApprovals: 1 }];
  }
  return version.rows.map((row) => ({
    key: nextRowKey(),
    minTotal: row.minTotal,
    requiredApprovals: row.requiredApprovals,
  }));
}

function formatDateTimeBR(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Editor da matriz de alçadas (Configurações › Compras).
 *
 * Cada versão salva SUBSTITUI a anterior para novas decisões (a anterior é
 * encerrada, nunca apagada). O teto de cada faixa é o piso da faixa seguinte e a
 * última faixa não tem teto — a mesma regra de contiguidade validada no servidor.
 */
export function ApprovalMatrixSettings({ canConfigure, history }: ApprovalMatrixSettingsProps) {
  const router = useRouter();
  const versions = history?.versions ?? [];
  const activeVersionNumber = history?.activeVersion ?? null;
  const activeVersion = versions.find((version) => version.version === activeVersionNumber) ?? null;

  const [rows, setRows] = React.useState<RowState[]>(() => rowsFromVersion(activeVersion));
  const [reason, setReason] = React.useState("");
  const [rowErrors, setRowErrors] = React.useState<Record<number, string>>({});
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // A versão ativa vem do servidor: após salvar/refresh, a prévia acompanha a nova matriz.
  React.useEffect(() => {
    setRows(rowsFromVersion(activeVersion));
    setRowErrors({});
    setReasonError(null);
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  if (!canConfigure || !history) {
    return (
      <div className="flex items-start gap-space-sm rounded border border-signal-hold/40 bg-signal-hold/10 p-space-md">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-signal-hold" />
        <div className="flex flex-col gap-1">
          <h2 className="font-headline-sm text-headline-sm text-ice-white">
            Sem permissão para configurar a matriz de alçadas
          </h2>
          <p className="text-body-sm font-body-sm text-titanium-light">
            A configuração exige a capability{" "}
            <code className="font-mono">purchase.configure_approval</code>, disponível para os
            papéis admin e diretor. A emissão de pedidos permanece bloqueada enquanto não existir
            uma matriz ativa.
          </p>
        </div>
      </div>
    );
  }

  function updateRow(index: number, patch: Partial<RowState>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
    setRowErrors((current) => {
      if (!current[index]) return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  function addRow() {
    setRows((current) => {
      const lastMin = current[current.length - 1]?.minTotal ?? 0;
      return [...current, { key: nextRowKey(), minTotal: lastMin + 1000, requiredApprovals: 1 }];
    });
  }

  function removeRow(index: number) {
    if (index <= 0) return;
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setRowErrors({});
  }

  function validate(): number {
    const nextRowErrors: Record<number, string> = {};
    let invalid = 0;

    if (rows.length === 0) {
      setRowErrors({ 0: "Inclua ao menos uma faixa." });
      return 1;
    }

    rows.forEach((row, index) => {
      if (row.minTotal == null) {
        nextRowErrors[index] = "Informe o piso da faixa.";
        invalid += 1;
        return;
      }
      if (index === 0 && row.minTotal !== 0) {
        nextRowErrors[index] = "A primeira faixa deve começar em R$ 0,00.";
        invalid += 1;
        return;
      }
      const previous = rows[index - 1];
      if (index > 0 && previous?.minTotal != null && row.minTotal <= previous.minTotal) {
        nextRowErrors[index] = "O piso deve ser maior que o da faixa anterior.";
        invalid += 1;
      }
      if (row.requiredApprovals < 1 || row.requiredApprovals > 5) {
        nextRowErrors[index] = "A quantidade de aprovadores deve ficar entre 1 e 5.";
        invalid += 1;
      }
    });

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setReasonError("Informe o motivo da alteração (mínimo 3 caracteres).");
      invalid += 1;
    } else {
      setReasonError(null);
    }

    setRowErrors(nextRowErrors);
    return invalid;
  }

  async function handleSave() {
    if (saving) return;
    const invalid = validate();
    if (invalid > 0) {
      toast.error("Revise as faixas e o motivo antes de salvar a nova versão.");
      return;
    }

    const payloadRows = rows.map((row, index) => ({
      minTotal: row.minTotal ?? 0,
      // Contiguidade por construção: o teto é o piso da próxima faixa; a última fica aberta.
      maxTotal: index < rows.length - 1 ? (rows[index + 1].minTotal ?? 0) : null,
      approverPermission: "purchase.approve" as const,
      requiredApprovals: row.requiredApprovals,
    }));

    setSaving(true);
    try {
      const res = await fetch("/api/purchases/approval-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows, reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        version?: number;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Não foi possível salvar a matriz de alçadas.");
      }
      toast.success(
        `Matriz de alçadas v${body?.version ?? "?"} criada e ativa. A versão anterior foi encerrada.`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro inesperado ao salvar a matriz de alçadas."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-space-md">
      {/* Versão ativa */}
      <section className="rounded border border-carbon-800 bg-carbon-900 p-space-md">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-carbon-800 pb-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-tertiary" />
            <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
              Versão ativa da matriz
            </h2>
            {activeVersion ? (
              <span className="rounded border border-signal-buy/40 bg-signal-buy/10 px-2 py-0.5 font-mono text-label-code text-signal-buy">
                v{activeVersion.version} ativa
              </span>
            ) : (
              <span className="rounded border border-signal-hold/40 bg-signal-hold/10 px-2 py-0.5 font-mono text-label-code text-signal-hold">
                não configurada
              </span>
            )}
          </div>
          {activeVersion && (
            <span className="font-mono text-label-code text-titanium-muted">
              Vigente desde {formatDateTimeBR(activeVersion.activeFrom)}
            </span>
          )}
        </div>

        {activeVersion ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="border-b border-carbon-800 bg-carbon-950 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th className="px-3 py-2">Faixa</th>
                  <th className="px-3 py-2 text-right">Piso</th>
                  <th className="px-3 py-2 text-right">Teto</th>
                  <th className="px-3 py-2 text-center">Aprovadores</th>
                  <th className="px-3 py-2">Permissão</th>
                  <th className="px-3 py-2">Autor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {activeVersion.rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-carbon-800/40">
                    <td className="px-3 py-2 font-mono text-label-code text-titanium-light">
                      Faixa de alçada
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-label-code text-ice-white">
                      {formatCurrencyBRL(row.minTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-label-code text-ice-white">
                      {row.maxTotal == null ? "sem teto" : formatCurrencyBRL(row.maxTotal)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-label-code text-titanium-light">
                      {row.requiredApprovals}
                    </td>
                    <td className="px-3 py-2 font-mono text-label-code text-tertiary">
                      {row.approverPermission}
                    </td>
                    <td className="px-3 py-2 font-body-sm text-titanium-muted">
                      {row.createdByName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-start gap-space-sm rounded border border-signal-hold/40 bg-signal-hold/10 p-space-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-signal-hold" />
            <p className="text-body-sm font-body-sm text-titanium-light">
              Nenhuma matriz de alçadas configurada. Pedidos submetidos ficam em “Aguardando alçada”
              e a emissão permanece bloqueada. A primeira versão é criada abaixo e passa a valer
              imediatamente.
            </p>
          </div>
        )}
      </section>

      {/* Nova versão */}
      <section className="rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-carbon-800 pb-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-tertiary" />
            <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
              Nova versão da matriz
            </h2>
          </div>
          <span className="font-mono text-label-code text-titanium-muted">
            vigência imediata · exige motivo
          </span>
        </div>

        <p className="mb-3 text-body-sm font-body-sm text-titanium-light">
          Faixas contíguas a partir de R$ 0,00: cada faixa começa onde a anterior termina e a última
          não tem teto. Salvar substitui a versão ativa para novas decisões — a anterior fica no
          histórico.
        </p>

        <div className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const isFirst = index === 0;
            const isLast = index === rows.length - 1;
            const nextRow = rows[index + 1];
            const error = rowErrors[index];
            return (
              <div
                key={row.key}
                className="grid grid-cols-1 items-start gap-2 rounded border border-carbon-800 bg-carbon-950/40 p-2 md:grid-cols-12"
              >
                <div className="flex flex-col gap-1 md:col-span-4">
                  <span className={FIELD_LABEL}>Piso (R$)</span>
                  {isFirst ? (
                    <div className="flex h-9 items-center rounded border border-carbon-700 bg-carbon-900 px-3 font-mono text-body-md text-titanium-muted">
                      R$ 0,00
                    </div>
                  ) : (
                    <CurrencyInput
                      value={row.minTotal}
                      onValueChange={(value) => updateRow(index, { minTotal: value })}
                      error={Boolean(error)}
                      className="text-right"
                      aria-label={`Piso da faixa ${index + 1}`}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1 md:col-span-3">
                  <span className={FIELD_LABEL}>Teto (R$)</span>
                  <div className="flex h-9 items-center rounded border border-carbon-800 bg-carbon-900 px-3 font-mono text-body-md text-titanium-muted">
                    {isLast
                      ? "Sem teto"
                      : nextRow?.minTotal != null
                        ? formatCurrencyBRL(nextRow.minTotal)
                        : "definido pelo próximo piso"}
                  </div>
                </div>

                <div className="flex flex-col gap-1 md:col-span-3">
                  <span className={FIELD_LABEL}>Aprovadores</span>
                  <SelectMenu
                    value={String(row.requiredApprovals)}
                    onChange={(value) => updateRow(index, { requiredApprovals: Number(value) })}
                    options={APPROVERS_OPTIONS}
                    aria-label={`Aprovadores exigidos na faixa ${index + 1}`}
                  />
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <span className={FIELD_LABEL}>Permissão</span>
                  <div className="flex h-9 items-center rounded border border-carbon-800 bg-carbon-900 px-3 font-mono text-label-code text-tertiary">
                    purchase.approve
                  </div>
                </div>

                {error && (
                  <p className="text-body-sm text-carmine-signal md:col-span-12">{error}</p>
                )}

                <div className="flex items-center justify-end gap-2 md:col-span-12">
                  <span className="font-mono text-label-code text-titanium-muted">
                    {isFirst
                      ? "Início da matriz"
                      : nextRow?.minTotal != null
                        ? "Faixa contígua"
                        : "Última faixa (aberta)"}
                  </span>
                  <button
                    type="button"
                    title={`Remover faixa ${index + 1}`}
                    aria-label={`Remover faixa ${index + 1}`}
                    disabled={isFirst || saving}
                    onClick={() => removeRow(index)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-carbon-700 bg-carbon-800 text-titanium-muted transition-colors hover:bg-carbon-700 hover:text-signal-risk focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2">
          <Button type="button" variant="secondary" size="sm" onClick={addRow} disabled={saving}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar faixa
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="matrix-reason" className={FIELD_LABEL}>
            Motivo da alteração <span className="text-carmine-signal">*</span>
          </label>
          <textarea
            id="matrix-reason"
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError(null);
            }}
            placeholder="Ex.: revisão anual de alçadas aprovada pela diretoria."
            aria-invalid={Boolean(reasonError)}
            className={`w-full rounded border bg-carbon-950 px-3 py-2 text-body-md text-ice-white placeholder-titanium-dark transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core ${
              reasonError ? "border-signal-risk" : "border-carbon-700"
            }`}
          />
          {reasonError && <p className="text-body-sm text-carmine-signal">{reasonError}</p>}
          <p className="text-body-sm text-titanium-muted">
            O motivo fica registrado na auditoria junto com a nova versão. O autor é o usuário
            logado, não um campo editável.
          </p>
        </div>

        <div className="mt-3 flex items-center justify-end border-t border-carbon-800 pt-3">
          <Button type="button" variant="primary" size="md" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando…" : "Salvar nova versão"}
          </Button>
        </div>
      </section>

      {/* Histórico versionado */}
      <section className="rounded border border-carbon-800 bg-carbon-900 p-space-md">
        <div className="mb-3 flex items-center gap-2 border-b border-carbon-800 pb-2">
          <History className="h-4 w-4 text-titanium-muted" />
          <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
            Histórico versionado
          </h2>
          <span className="rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-light">
            {versions.length} versão(ões)
          </span>
        </div>

        {versions.length === 0 ? (
          <p className="text-body-sm font-body-sm text-titanium-muted">
            Nenhuma versão registrada. A primeira versão salva acima inicia o histórico.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="border-b border-carbon-800 bg-carbon-950 font-label-caps text-label-caps text-titanium-muted">
                <tr>
                  <th className="px-3 py-2">Versão</th>
                  <th className="px-3 py-2">Vigência</th>
                  <th className="px-3 py-2">Faixas</th>
                  <th className="px-3 py-2">Autor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon-800/80">
                {versions.map((version) => {
                  const isActive = version.version === activeVersionNumber;
                  return (
                    <tr key={version.version} className="transition-colors hover:bg-carbon-800/40">
                      <td className="px-3 py-2">
                        <span className="font-mono text-label-code font-bold text-ice-white">
                          v{version.version}
                        </span>
                        {isActive && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded border border-signal-buy/40 bg-signal-buy/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-signal-buy">
                            ativa
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-label-code text-titanium-light">
                        {formatDateTimeBR(version.activeFrom)}
                        <span className="text-titanium-muted">
                          {" "}
                          →{" "}
                          {version.activeUntil ? formatDateTimeBR(version.activeUntil) : "vigente"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {version.rows.map((row) => (
                            <span
                              key={row.id}
                              className="rounded border border-carbon-700 bg-carbon-950 px-1.5 py-0.5 font-mono text-[10px] text-titanium-light"
                            >
                              {formatCurrencyBRL(row.minTotal)} –{" "}
                              {row.maxTotal == null ? "sem teto" : formatCurrencyBRL(row.maxTotal)}
                              <span className="text-titanium-muted">
                                {" "}
                                ({row.requiredApprovals}x)
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-body-sm text-titanium-muted">
                        {version.rows[0]?.createdByName ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
