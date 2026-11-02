"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { Layers, Search, Printer, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  reserveRemnantAction,
  releaseRemnantAction,
  scrapRemnantAction,
} from "@/app/(app)/estoque/actions";

export interface RemnantItem {
  id: string;
  code: string;
  productId: string;
  productSku?: string;
  productDescription?: string;
  productNorm?: string;
  warehouseId?: string;
  warehouseName?: string;
  parentLotId?: string | null;
  parentHeatNumber?: string | null;
  thicknessMm: string | number;
  widthMm?: string | number | null;
  lengthMm?: string | number | null;
  diameterMm?: string | number | null;
  weightKg: string | number;
  locationAddress: string;
  status: "disponivel" | "reservado" | "consumido" | "descarte" | string;
  reservedForQuoteId?: string | null;
  notes?: string | null;
  createdAt?: string | Date;
}

export interface RemnantsCatalogProps {
  remnants: RemnantItem[];
  onNewRemnant?: () => void;
  onPrintLabel?: (remnant: RemnantItem) => void;
  onChanged?: () => void;
  canWrite?: boolean;
}

export function RemnantsCatalog({
  remnants,
  onNewRemnant,
  onPrintLabel,
  onChanged,
  canWrite = false,
}: RemnantsCatalogProps) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [scrapTarget, setScrapTarget] = React.useState<RemnantItem | null>(null);

  async function runAction(rem: RemnantItem, kind: "reserve" | "release" | "scrap") {
    setBusyId(rem.id);
    try {
      if (kind === "reserve") await reserveRemnantAction(rem.id);
      else if (kind === "release") await releaseRemnantAction(rem.id);
      else await scrapRemnantAction(rem.id);
      toast.success(
        kind === "reserve"
          ? `Retalho #${rem.code} reservado.`
          : kind === "release"
            ? `Retalho #${rem.code} liberado.`
            : `Retalho #${rem.code} descartado.`
      );
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusyId(null);
      setScrapTarget(null);
    }
  }

  const [selectedAlloy, setSelectedAlloy] = React.useState("Todas");
  const [search, setSearch] = React.useState("");
  const [warehouseFilter, setWarehouseFilter] = React.useState("todos");

  const alloys = [
    "Todas",
    "A36",
    "SAE 1008",
    "SAE 1020",
    "Inox 304",
    "Alumínio 5052",
    "Galvanizado",
  ];

  const filteredRemnants = React.useMemo(() => {
    return remnants.filter((rem) => {
      const matchSearch =
        search === "" ||
        rem.code.toLowerCase().includes(search.toLowerCase()) ||
        (rem.productDescription &&
          rem.productDescription.toLowerCase().includes(search.toLowerCase())) ||
        (rem.parentHeatNumber &&
          rem.parentHeatNumber.toLowerCase().includes(search.toLowerCase())) ||
        (rem.locationAddress && rem.locationAddress.toLowerCase().includes(search.toLowerCase())) ||
        (rem.notes && rem.notes.toLowerCase().includes(search.toLowerCase()));

      const matchAlloy =
        selectedAlloy === "Todas" ||
        (rem.productDescription &&
          rem.productDescription.toLowerCase().includes(selectedAlloy.toLowerCase())) ||
        (rem.productNorm && rem.productNorm.toLowerCase().includes(selectedAlloy.toLowerCase())) ||
        (rem.notes && rem.notes.toLowerCase().includes(selectedAlloy.toLowerCase()));

      const matchWarehouse = warehouseFilter === "todos" || rem.warehouseId === warehouseFilter;

      return matchSearch && matchAlloy && matchWarehouse;
    });
  }, [remnants, search, selectedAlloy, warehouseFilter]);

  return (
    <div className="flex flex-col mb-4">
      {/* Filter Control Bar */}
      <div className="bg-carbon-900 border border-carbon-800 p-4 rounded mb-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-tertiary" />
          <h2 className="text-headline-sm font-semibold text-ice-white">
            Catálogo Técnico de Retalhos Sobressalentes (Offcuts 2D/3D)
          </h2>
          <span className="bg-carbon-800 text-titanium-light px-2 py-0.5 rounded font-mono text-label-code border border-carbon-700">
            {remnants.length} ITENS
          </span>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-label-caps">
          <span className="text-titanium-muted mr-1">Ligas:</span>
          {alloys.map((alloy) => (
            <button
              key={alloy}
              type="button"
              onClick={() => setSelectedAlloy(alloy)}
              className={cn(
                "px-2 py-1 rounded transition-colors text-label-code",
                selectedAlloy === alloy
                  ? "bg-carmine-core text-ice-white font-semibold"
                  : "bg-carbon-800 hover:bg-carbon-700 text-titanium-light"
              )}
            >
              {alloy}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por Heat / OP / Dimensão..."
              className="bg-carbon-950 text-ice-white font-sans text-body-sm px-2.5 py-1.5 pl-8 rounded w-60 border border-carbon-700 focus:outline-none focus:border-carmine-core placeholder-titanium-dark"
            />
            <Search className="w-4 h-4 text-titanium-dark absolute left-2 top-2" />
          </div>

          {canWrite && onNewRemnant && (
            <Button variant="primary" size="sm" onClick={onNewRemnant}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Retalho
            </Button>
          )}
        </div>
      </div>

      {/* Retalhos Grid (Technical Industrial Cards Mockup 1:1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {filteredRemnants.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-carbon-900 border border-carbon-800 rounded font-mono text-body-sm text-titanium-muted">
            Nenhum retalho encontrado para o filtro aplicado.
          </div>
        ) : (
          filteredRemnants.map((rem) => {
            const isSlitterOrCoil =
              rem.productDescription?.toLowerCase().includes("bobina") ||
              rem.productDescription?.toLowerCase().includes("galvanizad") ||
              rem.notes?.toLowerCase().includes("slitter");

            const isAllocated = rem.status === "reservado";
            const isAvailable = rem.status === "disponivel";

            const thickness = Number(rem.thicknessMm) || 0;
            const width = Number(rem.widthMm) || 0;
            const length = Number(rem.lengthMm) || 0;
            const weight = Number(rem.weightKg) || 0;

            return (
              <div
                key={rem.id}
                className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between relative shadow-sm hover:border-carbon-700 transition-colors"
              >
                <div>
                  {/* Header Card */}
                  <div className="flex items-start justify-between pb-2 mb-2 border-b border-carbon-800/60">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-label-code font-bold text-ice-white bg-carbon-800 px-1.5 py-0.5 rounded border border-carbon-700">
                          #{rem.code}
                        </span>
                        {isAllocated ? (
                          <span className="bg-signal-buy/20 text-signal-buy font-mono text-label-code px-1.5 py-0.5 rounded border border-signal-buy/30 font-semibold">
                            RESERVADO
                          </span>
                        ) : isSlitterOrCoil ? (
                          <span className="bg-signal-hold/20 text-signal-hold font-mono text-label-code px-1.5 py-0.5 rounded border border-signal-hold/30 font-semibold">
                            PONTA DE BOBINA
                          </span>
                        ) : (
                          <span className="bg-tertiary/20 text-tertiary font-mono text-label-code px-1.5 py-0.5 rounded border border-tertiary/30 font-semibold">
                            DISPONÍVEL
                          </span>
                        )}
                      </div>
                      <h3 className="text-body-lg font-bold text-ice-white mt-1 leading-snug">
                        {rem.productDescription || "Chapa Grossa A36"}
                      </h3>
                    </div>

                    {/* Technical Geometry Visualization SVG */}
                    <div className="w-12 h-10 bg-carbon-950 border border-carbon-800 rounded flex items-center justify-center p-1 shrink-0">
                      {isSlitterOrCoil ? (
                        <svg className="w-full h-full" viewBox="0 0 40 30">
                          <circle
                            className="stroke-signal-hold"
                            cx="20"
                            cy="15"
                            fill="none"
                            r="10"
                            strokeWidth="2"
                          />
                          <circle
                            className="fill-carbon-800 stroke-signal-hold"
                            cx="20"
                            cy="15"
                            r="4"
                            strokeWidth="1"
                          />
                        </svg>
                      ) : (
                        <svg className="w-full h-full" viewBox="0 0 40 30">
                          <rect
                            className={`fill-carbon-800 ${
                              isAllocated
                                ? "stroke-carmine-core"
                                : isAvailable
                                  ? "stroke-tertiary"
                                  : "stroke-titanium-steel"
                            }`}
                            height="22"
                            strokeWidth="1.5"
                            width="34"
                            x="3"
                            y="4"
                          />
                          {isAllocated && (
                            <line
                              className="stroke-carmine-core"
                              strokeDasharray="1 1"
                              strokeWidth="0.5"
                              x1="3"
                              x2="37"
                              y1="4"
                              y2="26"
                            />
                          )}
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Dimension Specs Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-carbon-950 border border-carbon-800 p-2.5 rounded my-2 font-mono text-label-code">
                    <div>
                      <span className="text-titanium-muted">Dimensões:</span>
                      <div className="text-ice-white font-metric-compact font-bold">
                        {width > 0 && length > 0
                          ? `${width.toLocaleString("pt-BR")} x ${length.toLocaleString("pt-BR")} mm`
                          : rem.diameterMm
                            ? `Ø ${rem.diameterMm} mm x ${length} mm`
                            : "Sob medida"}
                      </div>
                    </div>
                    <div>
                      <span className="text-titanium-muted">Espessura:</span>
                      <div className="text-ice-white font-metric-compact font-bold">
                        {thickness} mm
                      </div>
                    </div>
                    <div>
                      <span className="text-titanium-muted">Peso Líquido:</span>
                      <div className="text-signal-buy font-metric-compact font-bold">
                        {weight.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 3,
                        })}{" "}
                        kg
                      </div>
                    </div>
                    <div>
                      <span className="text-titanium-muted">Corrida Usina:</span>
                      <div className="text-titanium-light truncate">
                        {rem.parentHeatNumber || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Traceability & QR Code Section */}
                  <div className="flex items-center gap-2.5 py-1.5">
                    {/* Simulated QR Code */}
                    <div className="w-11 h-11 bg-paper p-1 rounded shrink-0 flex items-center justify-center">
                      <svg
                        className="w-full h-full text-ink"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M2 2h8v8H2zM4 4v4h4V4zm10-2h8v8h-8zm2 2v4h4V4zM2 14h8v8H2zm2 2v4h4v-4zm10 0h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z" />
                      </svg>
                    </div>

                    <div className="flex flex-col font-mono text-label-code overflow-hidden leading-tight">
                      <span className="text-titanium-muted truncate">
                        Origem: <strong className="text-titanium-light">{rem.notes || "—"}</strong>
                      </span>
                      <span className="text-titanium-muted truncate mt-0.5">
                        Local: <strong className="text-ice-white">{rem.locationAddress}</strong>
                      </span>
                      <span
                        className={cn(
                          "font-semibold truncate mt-0.5",
                          isAllocated ? "text-signal-buy" : "text-tertiary"
                        )}
                      >
                        {isAllocated
                          ? "Reservado para orçamento"
                          : isAvailable
                            ? "Livre p/ Matching em Vendas"
                            : "Fora de estoque"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-1.5 pt-2 bg-carbon-950/60 -mx-4 -mb-4 p-3 border-t border-carbon-800">
                  <button
                    type="button"
                    onClick={() => onPrintLabel?.(rem)}
                    className="flex-1 bg-carbon-800 hover:bg-carbon-700 text-ice-white py-1 rounded font-mono text-label-code flex items-center justify-center gap-1 transition-colors border border-carbon-700"
                    title="Imprimir Etiqueta Argox/Zebra"
                  >
                    <Printer className="w-3.5 h-3.5" /> Etiqueta
                  </button>

                  {canWrite && isAvailable && (
                    <button
                      type="button"
                      disabled={busyId === rem.id}
                      onClick={() => runAction(rem, "reserve")}
                      className="flex-1 bg-carmine-core hover:bg-carmine-signal text-ice-white py-1 rounded font-mono text-label-code font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-60"
                    >
                      Reservar
                    </button>
                  )}
                  {canWrite && isAllocated && (
                    <button
                      type="button"
                      disabled={busyId === rem.id}
                      onClick={() => runAction(rem, "release")}
                      className="flex-1 bg-carbon-800 hover:bg-carbon-700 text-ice-white py-1 rounded font-mono text-label-code flex items-center justify-center gap-1 transition-colors border border-carbon-700 disabled:opacity-60"
                    >
                      Liberar
                    </button>
                  )}
                  {canWrite && (isAvailable || isAllocated) && (
                    <button
                      type="button"
                      disabled={busyId === rem.id}
                      onClick={() => setScrapTarget(rem)}
                      className="bg-carbon-800 hover:bg-carbon-700 text-titanium-light px-2 py-1 rounded font-mono text-label-code border border-carbon-700 disabled:opacity-60"
                      title="Descartar retalho"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(scrapTarget)}
        title="Descartar retalho"
        description={`O retalho #${scrapTarget?.code ?? ""} sairá do estoque disponível. Esta ação fica registrada na auditoria.`}
        confirmLabel="Descartar"
        loading={busyId !== null}
        onConfirm={() => scrapTarget && runAction(scrapTarget, "scrap")}
        onCancel={() => setScrapTarget(null)}
      />
    </div>
  );
}
