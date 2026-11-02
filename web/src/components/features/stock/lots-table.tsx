"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, Plus, Filter, Tag, ShieldCheck } from "lucide-react";

export interface StockLotItem {
  id: string;
  lotNumber: string;
  heatNumber?: string | null;
  productId: string;
  productSku: string;
  productDescription: string;
  productNorm?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  warehouseId: string;
  warehouseName?: string;
  quantityInitial: string | number;
  quantityCurrent: string | number;
  unitCost: string | number;
  locationAddress?: string | null;
  entryDate: string | Date;
  status: "ativo" | "esgotado" | "bloqueado" | string;
  createdAt?: string | Date;
}

export interface LotsTableProps {
  lots: StockLotItem[];
  onNewMovement?: () => void;
}

export function LotsTable({ lots, onNewMovement }: LotsTableProps) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("todos");

  const filteredLots = React.useMemo(() => {
    return lots.filter((lot) => {
      const matchSearch =
        search === "" ||
        lot.lotNumber.toLowerCase().includes(search.toLowerCase()) ||
        (lot.heatNumber && lot.heatNumber.toLowerCase().includes(search.toLowerCase())) ||
        lot.productSku.toLowerCase().includes(search.toLowerCase()) ||
        lot.productDescription.toLowerCase().includes(search.toLowerCase()) ||
        (lot.locationAddress && lot.locationAddress.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === "todos" || lot.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [lots, search, statusFilter]);

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4">
      {/* Table Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-headline-sm font-semibold text-ice-white flex items-center gap-2">
            <Tag className="w-4 h-4 text-tertiary" />
            Rastreabilidade de Lotes Físicos & Corridas de Usina
          </h2>
          <p className="text-body-sm text-titanium-muted">
            Histórico completo de entradas por lote, corrida (heat number), custo unitário e
            depósito.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar Lote / Corrida / SKU..."
              className="w-full bg-carbon-950 text-ice-white font-mono text-label-code px-2.5 py-1.5 pl-8 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
            <Search className="w-3.5 h-3.5 text-titanium-dark absolute left-2.5 top-2" />
          </div>

          {onNewMovement && (
            <Button variant="primary" size="sm" onClick={onNewMovement}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Entrada de Lote
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-carbon-950 font-mono text-label-caps text-titanium-muted uppercase border-b border-carbon-800">
              <th className="py-2.5 px-3 font-semibold">Lote / Corrida Usina</th>
              <th className="py-2.5 px-3 font-semibold">SKU / Produto Metálico</th>
              <th className="py-2.5 px-3 font-semibold">Fornecedor / Usina</th>
              <th className="py-2.5 px-3 font-semibold text-right">Saldo Inicial</th>
              <th className="py-2.5 px-3 font-semibold text-right">Saldo Atual</th>
              <th className="py-2.5 px-3 font-semibold text-right">Custo Unitário</th>
              <th className="py-2.5 px-3 font-semibold">Local / Endereço</th>
              <th className="py-2.5 px-3 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-800/40 text-body-sm font-sans">
            {filteredLots.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-titanium-muted font-mono text-body-sm"
                >
                  Nenhum lote físico cadastrado ou localizado no filtro.
                </td>
              </tr>
            ) : (
              filteredLots.map((lot) => {
                const initQty = Number(lot.quantityInitial) || 0;
                const currQty = Number(lot.quantityCurrent) || 0;
                const cost = Number(lot.unitCost) || 0;
                const isExhausted = lot.status === "esgotado" || currQty <= 0;

                return (
                  <tr
                    key={lot.id}
                    className="hover:bg-carbon-800/50 odd:bg-carbon-900 even:bg-carbon-950/40 transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-body-sm font-bold text-ice-white">
                        {lot.lotNumber}
                      </div>
                      <div className="font-mono text-label-code text-titanium-muted">
                        Corrida:{" "}
                        <span className="text-titanium-light">{lot.heatNumber || "S/N"}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-ice-white truncate max-w-xs">
                        {lot.productDescription}
                      </div>
                      <div className="font-mono text-label-code text-titanium-muted">
                        {lot.productSku} • {lot.productNorm}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-titanium-light">
                      {lot.supplierName || "Gerdau / Usina Homologada"}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-titanium-muted">
                      {initQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-ice-white font-semibold">
                      {currQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-metric-regular text-titanium-light">
                      R${" "}
                      {cost.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-label-code text-titanium-light">
                      {lot.locationAddress || "Galpão Central"}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {isExhausted ? (
                        <span className="bg-carbon-800 text-titanium-muted px-2 py-0.5 rounded font-mono text-label-code border border-carbon-700">
                          ESGOTADO
                        </span>
                      ) : (
                        <span className="bg-signal-buy/20 text-signal-buy px-2 py-0.5 rounded font-mono text-label-code font-semibold border border-signal-buy/30">
                          ATIVO
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
  );
}
