"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { History, ArrowDownLeft, ArrowUpRight, Scissors, RotateCcw, AlertTriangle } from "lucide-react";

export interface StockMovementItem {
  id: string;
  productId: string;
  productSku: string;
  productDescription: string;
  lotId?: string | null;
  lotNumber?: string | null;
  heatNumber?: string | null;
  warehouseId: string;
  warehouseName?: string;
  movementType: string;
  quantity: string | number;
  unitCost: string | number;
  totalCost: string | number;
  referenceDocument?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string | Date;
}

export interface MovementsTableProps {
  movements: StockMovementItem[];
}

export function MovementsTable({ movements }: MovementsTableProps) {
  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-headline-sm font-semibold text-ice-white flex items-center gap-2">
            <History className="w-4 h-4 text-tertiary" />
            Trilha de Auditoria & Movimentações Físicas (`stock_movements`)
          </h2>
          <p className="text-body-sm text-titanium-muted">
            Registro cronológico imutável de todas as entradas por compra, baixas de venda, requisições de corte e ajustes.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-carbon-950 font-mono text-label-caps text-titanium-muted uppercase border-b border-carbon-800">
              <th className="py-2.5 px-3 font-semibold">Data / Hora</th>
              <th className="py-2.5 px-3 font-semibold">Tipo Movimento</th>
              <th className="py-2.5 px-3 font-semibold">Produto / SKU</th>
              <th className="py-2.5 px-3 font-semibold">Lote / Corrida</th>
              <th className="py-2.5 px-3 font-semibold text-right">Quantidade</th>
              <th className="py-2.5 px-3 font-semibold text-right">Custo Total</th>
              <th className="py-2.5 px-3 font-semibold">Documento Ref / Motivo</th>
              <th className="py-2.5 px-3 font-semibold">Operador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-800/40 text-body-sm font-sans">
            {movements.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-titanium-muted font-mono text-body-sm">
                  Nenhuma movimentação registrada até o momento.
                </td>
              </tr>
            ) : (
              movements.map((m) => {
                const qty = Number(m.quantity) || 0;
                const isEntry = qty > 0;
                const totalCost = Number(m.totalCost) || 0;
                const dateStr = new Date(m.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <tr
                    key={m.id}
                    className="hover:bg-carbon-800/50 odd:bg-carbon-900 even:bg-carbon-950/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-label-code text-titanium-light">
                      {dateStr}
                    </td>

                    <td className="py-2.5 px-3">
                      {m.movementType === "ENTRADA_COMPRA" ? (
                        <span className="inline-flex items-center gap-1 bg-signal-buy/20 text-signal-buy px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                          <ArrowDownLeft className="w-3 h-3" /> ENTRADA COMPRA
                        </span>
                      ) : m.movementType === "SAIDA_VENDA" ? (
                        <span className="inline-flex items-center gap-1 bg-carmine-core/20 text-carmine-signal px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                          <ArrowUpRight className="w-3 h-3" /> SAÍDA VENDA
                        </span>
                      ) : m.movementType === "CORTE_CONSUMO" ? (
                        <span className="inline-flex items-center gap-1 bg-signal-hold/20 text-signal-hold px-2 py-0.5 rounded font-mono text-label-code font-semibold">
                          <Scissors className="w-3 h-3" /> CORTE CONSUMO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-carbon-800 text-titanium-light px-2 py-0.5 rounded font-mono text-label-code border border-carbon-700">
                          {m.movementType}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-ice-white truncate max-w-xs">
                        {m.productDescription}
                      </div>
                      <div className="font-mono text-label-code text-titanium-muted">
                        COD: {m.productSku}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-label-code text-titanium-light">
                      {m.lotNumber ? (
                        <span>
                          {m.lotNumber} {m.heatNumber ? `(#${m.heatNumber})` : ""}
                        </span>
                      ) : (
                        <span className="text-titanium-muted">-</span>
                      )}
                    </td>

                    <td
                      className={cn(
                        "py-2.5 px-3 text-right font-mono text-metric-regular font-bold",
                        isEntry ? "text-signal-buy" : "text-carmine-signal"
                      )}
                    >
                      {isEntry ? `+${qty}` : `${qty}`}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-titanium-light">
                      R$ {totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-ice-white text-body-sm font-medium">
                        {m.referenceDocument || "-"}
                      </div>
                      {m.notes && (
                        <div className="text-titanium-muted text-body-sm truncate max-w-xs">
                          {m.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-label-code text-titanium-muted">
                      {m.createdByName || "Sistema"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
