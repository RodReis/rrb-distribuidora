"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LEAD_TIME_SOURCE_LABEL, type LeadTimeSource } from "@/lib/suppliers/types";
import { Search, Clock, Zap, Settings2 } from "lucide-react";

export interface PredictiveMatrixItem {
  productId: string;
  sku: string;
  erpCode?: string | null;
  commercialDescription: string;
  norm: string;
  family: string;
  unit: string;
  thicknessMm?: string | null;
  currentStockQty: string | number;
  physicalStockQty?: string | number;
  reservedStockQty?: string | number;
  availableStockQty?: string | number;
  avgDailyConsumption30d: string | number;
  /** Nulo = lead time não definido (LAC-02). Nunca preenchido por default de código. */
  leadTimeDays: number | null;
  /** Origem do lead time resolvido (LAC-02). Nula quando `leadTimeDays` é nulo. */
  leadTimeSource?: LeadTimeSource | string | null;
  coverageDays: string | number;
  safetyStockQty?: string | number;
  reorderPointQty?: string | number;
  predictiveStatus:
    "CRITICAL_RUPTURE" | "WARNING" | "HEALTHY" | "EXCESS" | "SEM_LEAD_TIME" | string;
  suggestedPurchaseQty?: string | number;
  suggestedPurchaseDate?: string | Date | null;
  curveAbc?: string;
  curveXyz?: string;
}

/** Converte valores do banco (numeric → string) sem transformar ausência em 0. */
function parseLeadTimeDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function leadTimeSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return LEAD_TIME_SOURCE_LABEL[source as LeadTimeSource] ?? source;
}

export interface PredictiveMatrixTableProps {
  items: PredictiveMatrixItem[];
  selectedProductId?: string;
  onSelectProduct?: (item: PredictiveMatrixItem) => void;
  onOpenPurchaseSuggestion?: (item: PredictiveMatrixItem) => void;
}

export function PredictiveMatrixTable({
  items,
  selectedProductId,
  onSelectProduct,
  onOpenPurchaseSuggestion,
}: PredictiveMatrixTableProps) {
  const [filter, setFilter] = React.useState<"criticos" | "todos">("criticos");
  const [search, setSearch] = React.useState("");

  const criticalCount = items.filter((i) => i.predictiveStatus === "CRITICAL_RUPTURE").length;
  // Ausência de lead time não é ruptura: contada à parte, nunca somada aos críticos.
  const missingLeadTimeCount = items.filter((i) => i.predictiveStatus === "SEM_LEAD_TIME").length;

  const filteredItems = React.useMemo(() => {
    const urgencyRank: Record<string, number> = {
      CRITICAL_RUPTURE: 0,
      WARNING: 1,
      HEALTHY: 2,
      EXCESS: 3,
      // Sem lead time não dá para medir urgência: fica no fim, ordenado por SKU.
      SEM_LEAD_TIME: 4,
    };
    // Margem cobertura − lead time; null (sem lead time) vai para o fim, sem virar NaN.
    const margin = (i: PredictiveMatrixItem): number | null => {
      const leadTime = parseLeadTimeDays(i.leadTimeDays);
      const coverage = Number(i.coverageDays);
      if (leadTime === null || !Number.isFinite(coverage)) return null;
      return coverage - leadTime;
    };

    const visible = items.filter((item) => {
      const matchSearch =
        search === "" ||
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.commercialDescription.toLowerCase().includes(search.toLowerCase()) ||
        (item.erpCode && item.erpCode.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (filter === "criticos") return item.predictiveStatus === "CRITICAL_RUPTURE";

      return true;
    });

    return visible.sort((a, b) => {
      const rankDiff =
        (urgencyRank[a.predictiveStatus] ?? 9) - (urgencyRank[b.predictiveStatus] ?? 9);
      if (rankDiff !== 0) return rankDiff;

      const marginA = margin(a);
      const marginB = margin(b);
      if (marginA !== null && marginB !== null) return marginA - marginB;
      if (marginA === null && marginB === null) return a.sku.localeCompare(b.sku);
      return marginA === null ? 1 : -1;
    });
  }, [items, filter, search]);

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between">
      <div>
        {/* Table Header & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-carmine-core rounded-full" />
            <h2 className="text-headline-sm font-semibold text-ice-white">
              Matriz Preditiva de Ruptura de Estoque (Lead Time vs Cobertura)
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-48">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar SKU..."
                className="w-full bg-carbon-950 text-ice-white font-mono text-label-code px-2 py-1 pl-7 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
              />
              <Search className="w-3.5 h-3.5 text-titanium-dark absolute left-2 top-1.5" />
            </div>

            <div className="flex items-center gap-1 font-mono text-label-code">
              <span className="text-titanium-muted mr-1">Filtro:</span>
              <button
                type="button"
                onClick={() => setFilter("criticos")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  filter === "criticos"
                    ? "bg-carmine-core/20 text-carmine-signal border border-carmine-core/40 font-semibold"
                    : "bg-carbon-800 text-titanium-muted hover:text-ice-white"
                )}
              >
                Críticos ({criticalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter("todos")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  filter === "todos"
                    ? "bg-carbon-800 text-ice-white border border-carbon-700 font-semibold"
                    : "text-titanium-muted hover:text-ice-white"
                )}
              >
                Todos ({items.length})
              </button>
            </div>
          </div>
        </div>

        {/* Dense Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-950 font-mono text-label-caps text-titanium-muted uppercase border-b border-carbon-800">
                <th className="py-2.5 px-3 font-semibold">SKU / Especificação Técnica</th>
                <th className="py-2.5 px-3 font-semibold text-right">Disponível (consolidado)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Consumo Médio</th>
                <th className="py-2.5 px-3 font-semibold text-center">Cobertura</th>
                <th className="py-2.5 px-3 font-semibold text-center">Lead Time</th>
                <th className="py-2.5 px-3 font-semibold">Status Preditivo</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ação IA Sugerida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/40 text-body-sm font-sans">
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-titanium-muted font-mono text-body-sm"
                  >
                    Nenhum SKU encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const currentStock = Number(item.availableStockQty ?? item.currentStockQty) || 0;
                  const physicalStock = Number(item.physicalStockQty ?? item.currentStockQty) || 0;
                  const reservedStock = Number(item.reservedStockQty) || 0;
                  const avgDaily = Number(item.avgDailyConsumption30d) || 0;
                  const coverage = Number(item.coverageDays) || 0;
                  const leadTime = Number(item.leadTimeDays) || 15;
                  const isSelected = selectedProductId === item.productId;
                  const status = item.predictiveStatus;

                  // Delta between coverage and lead time
                  const deltaDays = Math.round(coverage - leadTime);
                  const isRupture = status === "CRITICAL_RUPTURE";
                  const isWarning = status === "WARNING";
                  const isExcess = status === "EXCESS";

                  return (
                    <tr
                      key={item.productId}
                      onClick={() => onSelectProduct?.(item)}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected
                          ? "bg-carbon-800 border-l-2 border-carmine-core"
                          : "hover:bg-carbon-800/70 odd:bg-carbon-900 even:bg-carbon-950/40"
                      )}
                    >
                      {/* SKU / Especificação */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ice-white leading-tight">
                          {item.commercialDescription}
                        </div>
                        <div className="font-mono text-label-code text-titanium-muted mt-0.5">
                          COD: {item.sku} {item.erpCode ? `// ${item.erpCode}` : ""}
                        </div>
                      </td>

                      {/* Saldo Físico */}
                      <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-ice-white">
                        <div>
                          {currentStock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
                          {item.unit || "t"}
                        </div>
                        <div className="text-[10px] text-titanium-muted">
                          Físico{" "}
                          {physicalStock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ·
                          Reservado{" "}
                          {reservedStock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                        </div>
                      </td>

                      {/* Consumo Diário */}
                      <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-titanium-light">
                        {avgDaily.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
                        {item.unit || "t"}/dia
                      </td>

                      {/* Cobertura */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={cn(
                            "font-mono text-metric-regular font-semibold",
                            isRupture && "text-carmine-signal",
                            isWarning && "text-signal-hold",
                            !isRupture && !isWarning && !isExcess && "text-signal-buy",
                            isExcess && "text-titanium-light"
                          )}
                        >
                          {coverage >= 999 ? ">180d" : `${coverage} dias`}
                        </span>
                      </td>

                      {/* Lead Time */}
                      <td className="py-2.5 px-3 text-center font-mono text-metric-regular text-titanium-light">
                        {leadTime} dias
                      </td>

                      {/* Status Preditivo */}
                      <td className="py-2.5 px-3">
                        {isRupture ? (
                          <span className="inline-flex items-center gap-1.5 bg-carmine-core/20 text-carmine-signal px-2 py-0.5 rounded font-mono text-label-code font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-carmine-signal animate-ping" />
                            RUPTURA IMINENTE ({deltaDays}d)
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1.5 bg-signal-hold/20 text-signal-hold px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-signal-hold" />
                            PONTO DE PEDIDO ({deltaDays}d)
                          </span>
                        ) : isExcess ? (
                          <span className="inline-flex items-center gap-1 bg-titanium-steel/20 text-titanium-light px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                            EXCESSO (&gt;180d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-signal-buy/20 text-signal-buy px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                            COBERTURA SEGURA (+{deltaDays}d)
                          </span>
                        )}
                      </td>

                      {/* Ação Sugerida */}
                      <td className="py-2.5 px-3 text-right">
                        {isRupture ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPurchaseSuggestion?.(item);
                            }}
                            className="bg-carmine-core hover:bg-carmine-signal text-ice-white px-2.5 py-1 rounded font-mono text-label-code font-semibold transition-colors shadow-sm"
                          >
                            Comprar {Number(item.suggestedPurchaseQty).toLocaleString("pt-BR")}{" "}
                            {item.unit}
                          </button>
                        ) : isWarning ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPurchaseSuggestion?.(item);
                            }}
                            className="bg-carbon-800 hover:bg-carbon-700 text-tertiary px-2.5 py-1 rounded font-mono text-label-code font-semibold transition-colors border border-carbon-700"
                          >
                            Ver sugestão de compra
                          </button>
                        ) : (
                          <span className="font-mono text-label-code text-titanium-muted">
                            Monitorar consumo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table Footer Note */}
      <div className="flex items-center justify-between pt-2.5 mt-2.5 text-titanium-muted font-mono text-label-code bg-carbon-950/60 p-2 rounded border border-carbon-800">
        <span>
          *Algoritmo determinístico diário integrando histórico de movimentações, lead time
          homologado e desvio padrão Z=1.645 (95%).
        </span>
        <span className="text-tertiary flex items-center gap-1">
          <Zap className="w-3 h-3 text-tertiary" /> Lead time do fornecedor do lote
        </span>
      </div>
    </div>
  );
}
