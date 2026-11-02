"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { approveMatchingAction } from "@/app/(app)/estoque/actions";
import { findMatchingRemnants } from "@/lib/stock/remnants-engine";
import { Bot, CheckCircle2, TrendingUp, Sliders, ArrowRight, Sparkles } from "lucide-react";

export interface AutoMatchingBannerProps {
  availableRemnants?: any[];
  onRemnantApproved?: () => void;
}

export function AutoMatchingBanner({
  availableRemnants = [],
  onRemnantApproved,
}: AutoMatchingBannerProps) {
  const [isSimulatorOpen, setIsSimulatorOpen] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [approved, setApproved] = React.useState(false);

  // Simulator inputs
  const [simThickness, setSimThickness] = React.useState("12.7");
  const [simWidth, setSimWidth] = React.useState("800");
  const [simLength, setSimLength] = React.useState("1500");
  const [simResults, setSimResults] = React.useState<any[] | null>(null);

  async function handleApprove() {
    setApproving(true);
    try {
      await approveMatchingAction(["RET-8941"], "PV-4491");
      setApproved(true);
      toast.success("Matching aprovado! Retalho #RET-8941 alocado para o Pedido #PV-4491.");
      onRemnantApproved?.();
    } catch (err: any) {
      toast.error(err.message || "Erro ao aprovar matching.");
    } finally {
      setApproving(false);
    }
  }

  function handleSimulate() {
    const t = parseFloat(simThickness);
    const w = parseFloat(simWidth);
    const l = parseFloat(simLength);

    if (isNaN(t) || isNaN(w) || isNaN(l)) {
      toast.error("Preencha dimensões numéricas válidas.");
      return;
    }

    const matches = findMatchingRemnants(availableRemnants, {
      thicknessMm: t,
      minWidthMm: w,
      minLengthMm: l,
    });

    setSimResults(matches);
    if (matches.length === 0) {
      toast.info(
        "Nenhum retalho com sobras suficientes para esta medida. Corte de chapa nova necessário."
      );
    } else {
      toast.success(
        `${matches.length} retalho(s) compatíveis encontrados! Menor desperdício: ${matches[0].wastePercentage}%`
      );
    }
  }

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 mb-4 shadow-md relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 mb-3 border-b border-carbon-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-tertiary-container/30 border border-tertiary/40 flex items-center justify-center text-tertiary">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-headline-sm font-semibold text-ice-white">
                Motor de Matching Automático: Retalho vs Pedidos de Venda
              </h2>
              <span className="bg-tertiary/20 text-tertiary font-mono text-label-code px-2 py-0.5 rounded font-semibold uppercase border border-tertiary/30">
                RF-04 & Nesting Engine
              </span>
            </div>
            <p className="text-body-sm text-titanium-muted">
              Algoritmo intercepta pedidos comerciais e bloqueia consumo de chapas novas inteiras
              quando há retalho compatível no pátio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-label-code text-titanium-muted">
            Matching IA Taxa Sucesso:
          </span>
          <span className="font-mono text-metric-regular text-signal-buy font-bold">88.6%</span>
        </div>
      </div>

      {/* Active Match Showcase Banner (Mockup 1:1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-carbon-950 border border-carbon-800 p-3.5 rounded items-center">
        {/* Left: Client & Order */}
        <div className="lg:col-span-4 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-carbon-800 text-titanium-light px-2 py-0.5 rounded font-mono text-label-code border border-carbon-700">
              NOVO MATCH ENCONTRADO
            </span>
            <span className="text-signal-buy font-mono text-label-code font-bold">
              ECONOMIA DIRETA
            </span>
          </div>
          <div className="text-body-lg text-ice-white font-semibold">Pedido de Venda #PV-4491</div>
          <div className="text-body-sm text-titanium-muted">
            Cliente: <span className="text-ice-white font-medium">Metalúrgica Alvorada</span> |
            Item: 38 Flanges 400x500 mm em A36 1/2&quot; (12.7mm).
          </div>
        </div>

        {/* Center: Comparison Avoided vs Allocated */}
        <div className="lg:col-span-5 flex flex-col sm:flex-row items-center gap-4 bg-carbon-900/90 border border-carbon-800 p-3 rounded">
          <div className="flex flex-col text-center sm:text-left">
            <span className="font-mono text-label-code text-titanium-muted uppercase">
              Solução Convencional Evitada:
            </span>
            <span className="text-body-sm text-carmine-signal line-through font-semibold">
              1 Chapa Virgem 6.000 x 2.400 mm
            </span>
            <span className="font-mono text-label-code text-titanium-muted">
              Custo Chapa Nova: R$ 8.920,00
            </span>
          </div>

          <div className="text-signal-buy">
            <ArrowRight className="w-5 h-5" />
          </div>

          <div className="flex flex-col text-center sm:text-left">
            <span className="font-mono text-label-code text-signal-buy uppercase font-semibold">
              Solução MetalAgents Alocada:
            </span>
            <span className="text-body-sm text-ice-white font-semibold">
              Retalhos #RET-8941 + #RET-8920
            </span>
            <span className="font-mono text-label-code text-tertiary">
              Aproveitamento Mecânico: 94.2%
            </span>
          </div>
        </div>

        {/* Right: Preserved Cost & Actions */}
        <div className="lg:col-span-3 flex flex-col items-end justify-center gap-2">
          <div className="text-right">
            <span className="font-mono text-label-code text-titanium-muted">
              Custo Preservado em Estoque:
            </span>
            <div className="font-mono text-metric-display text-signal-buy font-bold leading-tight">
              R$ 4.290,00
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving || approved}
              className={cn(
                "px-3 py-1.5 rounded font-mono text-label-caps transition-colors flex items-center gap-1.5 font-semibold",
                approved
                  ? "bg-signal-buy/20 text-signal-buy border border-signal-buy/40"
                  : "bg-tertiary-container hover:bg-signal-buy-dark text-ice-white"
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              {approved ? "MATCHING APROVADO" : approving ? "ALOCANDO..." : "APROVAR MATCHING"}
            </button>

            <button
              type="button"
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className="bg-carbon-800 hover:bg-carbon-700 text-titanium-light hover:text-ice-white px-2.5 py-1.5 rounded font-mono text-label-caps border border-carbon-700 transition-colors flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isSimulatorOpen ? "FECHAR" : "SIMULAR"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Simulator Bar */}
      {isSimulatorOpen && (
        <div className="mt-3 p-3 bg-carbon-950 border border-carbon-800 rounded animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-label-code text-tertiary font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> SIMULADOR GEOMÉTRICO 2D (BUSCAR RETALHO P/
              PEDIDO)
            </span>
            <span className="font-mono text-label-code text-titanium-muted">
              {availableRemnants.length} retalhos ativos no armazém
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
            <div>
              <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
                Espessura [mm]
              </label>
              <input
                type="number"
                step="0.1"
                value={simThickness}
                onChange={(e) => setSimThickness(e.target.value)}
                className="w-full bg-carbon-900 text-ice-white font-mono text-body-sm px-2.5 py-1 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
              />
            </div>
            <div>
              <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
                Largura Mínima [mm]
              </label>
              <input
                type="number"
                value={simWidth}
                onChange={(e) => setSimWidth(e.target.value)}
                className="w-full bg-carbon-900 text-ice-white font-mono text-body-sm px-2.5 py-1 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
              />
            </div>
            <div>
              <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
                Comprimento Mínimo [mm]
              </label>
              <input
                type="number"
                value={simLength}
                onChange={(e) => setSimLength(e.target.value)}
                className="w-full bg-carbon-900 text-ice-white font-mono text-body-sm px-2.5 py-1 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
              />
            </div>
            <div>
              <Button variant="primary" size="sm" onClick={handleSimulate} className="w-full">
                Buscar Retalho Compatível
              </Button>
            </div>
          </div>

          {/* Results list */}
          {simResults && (
            <div className="mt-3 pt-2.5 border-t border-carbon-800">
              {simResults.length === 0 ? (
                <div className="text-body-sm text-titanium-muted font-mono py-2 text-center">
                  Nenhum retalho com sobras suficientes para estas dimensões.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="font-mono text-label-code text-titanium-light font-semibold mb-1">
                    Melhores Opções de Reuso (Ordenadas pelo menor desperdício):
                  </div>
                  {simResults.slice(0, 3).map((res, idx) => (
                    <div
                      key={res.remnant.id || idx}
                      className="flex items-center justify-between p-2 bg-carbon-900 border border-carbon-800 rounded font-mono text-label-code"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-ice-white font-bold bg-carbon-800 px-1.5 py-0.5 rounded">
                          #{res.remnant.code}
                        </span>
                        <span className="text-titanium-light">
                          {res.remnant.thicknessMm}mm x {res.remnant.widthMm}mm x{" "}
                          {res.remnant.lengthMm}mm
                        </span>
                        {res.isRotated && (
                          <span className="text-signal-hold bg-signal-hold/10 px-1 py-0.2 rounded">
                            (Giro 90°)
                          </span>
                        )}
                        <span className="text-titanium-muted">{res.remnant.locationAddress}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-signal-buy font-bold">
                          Aproveitamento: {res.mechanicalEfficiencyPct}%
                        </span>
                        <span className="text-titanium-muted">
                          Desperdício: {res.wastePercentage}%
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            toast.success(
                              `Retalho #${res.remnant.code} vinculado à simulação de corte!`
                            );
                          }}
                          className="bg-carmine-core hover:bg-carmine-signal text-ice-white px-2 py-0.5 rounded font-mono text-label-code"
                        >
                          Vincular
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
