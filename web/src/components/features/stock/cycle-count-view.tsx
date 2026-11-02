"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { submitCycleCountAction } from "@/app/(app)/estoque/actions";
import {
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export interface CycleCountItem {
  lotId: string;
  lotNumber: string;
  heatNumber?: string | null;
  productId: string;
  productSku: string;
  productDescription: string;
  warehouseName: string;
  locationAddress?: string | null;
  systemQty: number;
  curveAbc: string;
  priorityReason: string;
  priorityLevel: 1 | 2 | 3;
}

export interface CycleCountViewProps {
  candidates: CycleCountItem[];
  accuracyPct: number;
  onCountSubmitted?: () => void;
}

export function CycleCountView({ candidates, accuracyPct, onCountSubmitted }: CycleCountViewProps) {
  // Store form state for each candidate
  const [counts, setCounts] = React.useState<Record<string, string>>({});
  const [justifications, setJustifications] = React.useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);
  const [completedIds, setCompletedIds] = React.useState<string[]>([]);

  function handleCountChange(lotId: string, val: string) {
    setCounts((prev) => ({ ...prev, [lotId]: val }));
  }

  function handleJustificationChange(lotId: string, val: string) {
    setJustifications((prev) => ({ ...prev, [lotId]: val }));
  }

  async function handleSubmit(item: CycleCountItem) {
    const rawVal = counts[item.lotId];
    if (rawVal === undefined || rawVal === "") {
      toast.error("Informe a contagem física aferida no armazém.");
      return;
    }

    const countedQty = parseFloat(rawVal);
    if (isNaN(countedQty) || countedQty < 0) {
      toast.error("Quantidade contada inválida.");
      return;
    }

    const diff = Number((countedQty - item.systemQty).toFixed(4));
    const just = justifications[item.lotId] || "";

    if (diff !== 0 && just.trim().length < 5) {
      toast.error(
        `Divergência detectada (${diff > 0 ? `+${diff}` : diff}). Justificativa obrigatória (mínimo 5 caracteres).`
      );
      return;
    }

    setSubmittingId(item.lotId);
    try {
      await submitCycleCountAction({
        lotId: item.lotId,
        countedQty,
        systemQty: item.systemQty,
        justification: just || "Conferência física 100% conciliada",
      });

      setCompletedIds((prev) => [...prev, item.lotId]);
      if (diff === 0) {
        toast.success(`Lote #${item.lotNumber} conferido com 100% de acuracidade!`);
      } else {
        toast.warning(
          `Lote #${item.lotNumber} ajustado com sucesso. Divergência de ${diff} registrada na auditoria.`
        );
      }
      onCountSubmitted?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar contagem.");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header and Accuracy Tile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-8 bg-carbon-900 border border-carbon-800 p-4 rounded flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-carbon-800 text-titanium-light font-mono text-label-code px-2 py-0.5 rounded border border-carbon-700">
                AUDITORIA FÍSICA GUIADA POR RISCO (RF-05)
              </span>
              <span className="flex items-center gap-1 font-mono text-label-code text-signal-buy">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-buy animate-pulse" />
                CONFERÊNCIA DIÁRIA ATIVA
              </span>
            </div>
            <h2 className="text-headline-sm font-semibold text-ice-white">
              Inventário Cíclico Dirigido por Risco
            </h2>
            <p className="text-body-sm text-titanium-muted mt-1">
              Algoritmo seleciona diariamente de 5 a 10 lotes prioritários baseando-se em
              divergências prévias, giro da Curva A e lotes sem conferência recente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-carbon-800 font-mono text-label-code text-titanium-muted">
            <span>Prioridade 1: Divergências anteriores</span>
            <span>•</span>
            <span>Prioridade 2: Itens Curva A com movimentação</span>
            <span>•</span>
            <span>Prioridade 3: Lotes sem contagem há mais de 90 dias</span>
          </div>
        </div>

        <div className="lg:col-span-4 bg-carbon-900 border border-carbon-800 p-4 rounded flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-code text-titanium-light uppercase tracking-wider font-semibold">
              Acuracidade Geral do Inventário
            </span>
            <CheckCircle2 className="w-5 h-5 text-tertiary" />
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-metric-display text-ice-white font-bold">
                {accuracyPct.toFixed(1)}%
              </span>
              <span className="font-mono text-label-code text-signal-buy font-semibold">
                ALTO RIGOR
              </span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">
              Auditoria contínua sem necessidade de parada fabril
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-carbon-800 font-mono text-label-code text-titanium-muted">
            <span>Lotes Concluídos Hoje:</span>
            <span className="text-ice-white font-semibold">
              {completedIds.length} de {candidates.length}
            </span>
          </div>
        </div>
      </div>

      {/* Candidate List (Mobile-friendly Cards) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-body-lg font-semibold text-ice-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-tertiary" />
            Lotes Sugeridos Para Contagem Física Hoje ({candidates.length})
          </h3>
        </div>

        {candidates.length === 0 ? (
          <div className="p-8 text-center bg-carbon-900 border border-carbon-800 rounded font-mono text-body-sm text-titanium-muted">
            Todos os itens prioritários já foram conferidos no ciclo atual. Posição de estoque 100%
            auditada!
          </div>
        ) : (
          candidates.map((item) => {
            const isCompleted = completedIds.includes(item.lotId);
            const rawVal = counts[item.lotId] ?? "";
            const countedNum = parseFloat(rawVal);
            const hasCounted = !isNaN(countedNum) && rawVal !== "";
            const diff = hasCounted ? Number((countedNum - item.systemQty).toFixed(4)) : 0;
            const hasDivergence = hasCounted && diff !== 0;

            return (
              <div
                key={item.lotId}
                className={cn(
                  "bg-carbon-900 border rounded p-4 transition-colors",
                  isCompleted
                    ? "border-signal-buy/40 bg-carbon-950/40 opacity-75"
                    : hasDivergence
                      ? "border-carmine-core/50"
                      : "border-carbon-800"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-label-code font-bold text-ice-white bg-carbon-800 px-2 py-0.5 rounded border border-carbon-700">
                        LOTE #{item.lotNumber}
                      </span>
                      {item.heatNumber && (
                        <span className="font-mono text-label-code text-titanium-light">
                          Corrida: #{item.heatNumber}
                        </span>
                      )}
                      <span
                        className={cn(
                          "font-mono text-label-code px-2 py-0.5 rounded font-semibold",
                          item.priorityLevel === 1
                            ? "bg-carmine-core/20 text-carmine-signal border border-carmine-core/30"
                            : item.priorityLevel === 2
                              ? "bg-signal-hold/20 text-signal-hold border border-signal-hold/30"
                              : "bg-carbon-800 text-titanium-light border border-carbon-700"
                        )}
                      >
                        {item.priorityReason}
                      </span>
                      <span className="font-mono text-label-code bg-carbon-950 text-titanium-muted px-1.5 py-0.5 rounded border border-carbon-800">
                        Curva {item.curveAbc}
                      </span>
                    </div>

                    <div className="text-body-lg font-bold text-ice-white mt-1">
                      {item.productDescription}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1 font-mono text-label-code text-titanium-muted">
                      <span>
                        SKU: <strong className="text-ice-white">{item.productSku}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Depósito:{" "}
                        <strong className="text-titanium-light">{item.warehouseName}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Localização:{" "}
                        <strong className="text-ice-white">
                          {item.locationAddress || "Pátio Central"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Middle: System vs Physical Input */}
                  <div className="flex flex-wrap items-center gap-4 bg-carbon-950 border border-carbon-800 p-3 rounded">
                    <div>
                      <span className="font-mono text-label-code text-titanium-muted uppercase block">
                        Saldo Sistema
                      </span>
                      <div className="font-mono text-metric-regular text-ice-white font-bold">
                        {item.systemQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="text-titanium-dark">
                      <ArrowRight className="w-4 h-4" />
                    </div>

                    <div>
                      <label className="font-mono text-label-code text-titanium-light uppercase block mb-0.5">
                        Contagem Física
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={isCompleted}
                        value={rawVal}
                        onChange={(e) => handleCountChange(item.lotId, e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          "w-28 bg-carbon-900 font-mono text-body-sm px-2.5 py-1 rounded border focus:outline-none",
                          hasDivergence
                            ? "border-carmine-core text-carmine-signal"
                            : "border-carbon-700 text-ice-white focus:border-carmine-core"
                        )}
                      />
                    </div>

                    {hasCounted && (
                      <div className="text-right pl-2 border-l border-carbon-800">
                        <span className="font-mono text-label-code text-titanium-muted uppercase block">
                          Divergência
                        </span>
                        <span
                          className={cn(
                            "font-mono text-metric-regular font-bold",
                            diff === 0 ? "text-signal-buy" : "text-carmine-signal"
                          )}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Submit Button */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={hasDivergence ? "danger" : "primary"}
                      size="sm"
                      disabled={isCompleted || submittingId === item.lotId || !hasCounted}
                      onClick={() => handleSubmit(item)}
                    >
                      {isCompleted ? (
                        <span className="flex items-center gap-1 text-signal-buy">
                          <CheckCircle2 className="w-4 h-4" /> CONFERIDO
                        </span>
                      ) : submittingId === item.lotId ? (
                        "Registrando..."
                      ) : (
                        "Confirmar Contagem"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Discrepancy Justification Field if discrepancy detected */}
                {hasDivergence && !isCompleted && (
                  <div className="mt-3 pt-3 border-t border-carbon-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-1.5 text-carmine-signal font-mono text-label-code font-semibold">
                      <AlertTriangle className="w-4 h-4" />
                      Justificativa Obrigatória de Divergência:
                    </div>
                    <input
                      type="text"
                      value={justifications[item.lotId] || ""}
                      onChange={(e) => handleJustificationChange(item.lotId, e.target.value)}
                      placeholder="Ex: Refugo não apontado no corte CNC / Perda operacional..."
                      className="flex-1 w-full bg-carbon-950 text-ice-white font-sans text-body-sm px-3 py-1 rounded border border-carmine-core/60 focus:outline-none focus:border-carmine-core placeholder-titanium-dark"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
