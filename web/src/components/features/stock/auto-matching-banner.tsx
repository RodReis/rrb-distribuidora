"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { reserveRemnantAction } from "@/app/(app)/estoque/actions";
import { findMatchingRemnants } from "@/lib/stock/remnants-engine";
import { Bot, Sliders, Sparkles, Info } from "lucide-react";

export interface AutoMatchingBannerProps {
  availableRemnants?: any[];
  onRemnantApproved?: () => void;
}

export function AutoMatchingBanner({
  availableRemnants = [],
  onRemnantApproved,
}: AutoMatchingBannerProps) {
  const [isSimulatorOpen, setIsSimulatorOpen] = React.useState(false);
  const [reservingId, setReservingId] = React.useState<string | null>(null);

  // Simulator inputs
  const [simThickness, setSimThickness] = React.useState("12.7");
  const [simWidth, setSimWidth] = React.useState("800");
  const [simLength, setSimLength] = React.useState("1500");
  const [simResults, setSimResults] = React.useState<any[] | null>(null);

  async function handleReserve(remnant: { id: string; code: string }) {
    setReservingId(remnant.id);
    try {
      await reserveRemnantAction(remnant.id);
      toast.success(`Retalho #${remnant.code} reservado com sucesso.`);
      setSimResults((prev) => prev?.filter((r) => r.remnant.id !== remnant.id) ?? null);
      onRemnantApproved?.();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível reservar o retalho.");
    } finally {
      setReservingId(null);
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

    const matches = findMatchingRemnants(
      availableRemnants.filter((r) => r.status === "disponivel"),
      {
        thicknessMm: t,
        minWidthMm: w,
        minLengthMm: l,
      }
    );

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
      </div>

      {/* Estado: sem pedidos sob medida (M3 ainda não entregue) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-carbon-950 border border-carbon-800 p-3.5 rounded">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-titanium-muted mt-0.5 shrink-0" />
          <div>
            <div className="text-body-md text-ice-white font-semibold">
              Nenhum pedido sob medida em análise
            </div>
            <div className="text-body-sm text-titanium-muted">
              O matching automático passa a rodar quando o módulo de Orçamentos (M3) estiver ativo.
              Enquanto isso, use o simulador para buscar um retalho compatível com uma medida.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
          className="bg-carbon-800 hover:bg-carbon-700 active:bg-carbon-900 text-titanium-light hover:text-ice-white px-2.5 py-1.5 rounded font-mono text-label-caps border border-carbon-700 transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{isSimulatorOpen ? "FECHAR" : "SIMULAR"}</span>
        </button>
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
                          disabled={reservingId === res.remnant.id}
                          onClick={() => handleReserve(res.remnant)}
                          className="bg-carmine-core hover:bg-carmine-signal active:bg-carmine-deep disabled:opacity-50 text-ice-white px-2 py-0.5 rounded font-mono text-label-code focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                        >
                          {reservingId === res.remnant.id ? "Reservando..." : "Reservar"}
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
