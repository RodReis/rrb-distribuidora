"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  QrCode,
  Recycle,
  Hourglass,
  Verified,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  Sparkles,
  Boxes,
  Plus,
  RefreshCw,
} from "lucide-react";
import { PredictiveMatrixTable } from "@/components/features/stock/predictive-matrix-table";
import { ForecastChart } from "@/components/features/stock/forecast-chart";
import { AutoMatchingBanner } from "@/components/features/stock/auto-matching-banner";
import { RemnantsCatalog } from "@/components/features/stock/remnants-catalog";
import { LotsTable } from "@/components/features/stock/lots-table";
import { MovementsTable } from "@/components/features/stock/movements-table";
import { CycleCountView } from "@/components/features/stock/cycle-count-view";
import { StockImportView } from "@/components/features/stock/stock-import-view";
import { MovementDrawer } from "@/components/features/stock/movement-drawer";
import { RemnantDrawer } from "@/components/features/stock/remnant-drawer";
import { PurchaseSuggestionModal } from "@/components/features/stock/purchase-suggestion-modal";
import { LabelPreviewModal } from "@/components/features/stock/label-preview-modal";
import { recalculateMetricsAction } from "./actions";
import type { StockKpis } from "@/lib/stock/kpis";

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface EstoqueClientProps {
  initialTab?: string;
  matrixItems: any[];
  remnants: any[];
  lots: any[];
  movements: any[];
  products: any[];
  warehouses: any[];
  suppliers: any[];
  cycleCountCandidates: any[];
  accuracyPct: number | null;
  kpis: StockKpis;
  canWrite: boolean;
}

function ReadOnlyNotice() {
  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 text-body-sm text-titanium-light">
      Seu perfil pode consultar o estoque, mas não registrar alterações. Peça acesso de escrita ao
      administrador para usar esta aba.
    </div>
  );
}

export function EstoqueClient({
  initialTab = "matriz",
  matrixItems,
  remnants,
  lots,
  movements,
  products,
  warehouses,
  suppliers,
  cycleCountCandidates,
  accuracyPct,
  kpis,
  canWrite,
}: EstoqueClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState("");
  const [reservations, setReservations] = React.useState<any[]>([]);
  const [salesOrders, setSalesOrders] = React.useState<any[]>([]);
  const [selectedSalesOrderId, setSelectedSalesOrderId] = React.useState("");
  const [transferFrom, setTransferFrom] = React.useState("");
  const [transferTo, setTransferTo] = React.useState("");
  const [transferLotId, setTransferLotId] = React.useState("");
  const [transferQuantity, setTransferQuantity] = React.useState("");
  const [transferRequestKey, setTransferRequestKey] = React.useState("");
  const [seasonalityRun, setSeasonalityRun] = React.useState<any | null>(null);
  const [seasonalityLoading, setSeasonalityLoading] = React.useState(false);
  const [reservationLoading, setReservationLoading] = React.useState(false);
  const [reservationLot, setReservationLot] = React.useState<any | null>(null);
  const [reservationQuantity, setReservationQuantity] = React.useState("");

  // Selected item for forecast chart
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(
    matrixItems.find((i) => i.predictiveStatus === "CRITICAL_RUPTURE") || matrixItems[0] || null
  );
  const reservationAvailable = reservationLot
    ? Math.max(
        0,
        Number(reservationLot.quantityCurrent) -
          reservations
            .filter((item) => item.lotId === reservationLot.id && item.status === "ativa")
            .reduce((total, item) => total + Number(item.quantity), 0)
      )
    : 0;

  // Drawers and Modals
  const [movementDrawerOpen, setMovementDrawerOpen] = React.useState(false);
  const [remnantDrawerOpen, setRemnantDrawerOpen] = React.useState(false);
  const [poModalItem, setPoModalItem] = React.useState<any | null>(null);
  const [labelModalRemnant, setLabelModalRemnant] = React.useState<any | null>(null);
  const [labelObjectType, setLabelObjectType] = React.useState<"lote" | "retalho">("retalho");
  const [recalculating, setRecalculating] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch("/api/stock/reservations")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar reservas.");
        return response.json();
      })
      .then((result) => {
        if (active) {
          setReservations(result.data ?? []);
          setSalesOrders(result.orders ?? []);
        }
      })
      .catch(() => {
        if (active) setReservations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function releaseReservation(reservationId: string) {
    setReservationLoading(true);
    try {
      const response = await fetch("/api/stock/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao liberar reserva.");
      setReservations((current) =>
        current.map((item) => (item.id === reservationId ? result.data : item))
      );
      toast.success("Reserva liberada.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReservationLoading(false);
    }
  }

  function createReservation(lot: any) {
    if (!selectedSalesOrderId) {
      toast.error("Selecione pedido de venda confirmado.");
      return;
    }
    setReservationLot(lot);
    setReservationQuantity("");
  }

  async function submitReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lot = reservationLot;
    const quantity = Number(reservationQuantity);
    if (!lot || !selectedSalesOrderId) return;
    const alreadyReserved = reservations
      .filter((item) => item.lotId === lot.id && item.status === "ativa")
      .reduce((total, item) => total + Number(item.quantity), 0);
    const available = Math.max(0, Number(lot.quantityCurrent) - alreadyReserved);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > available) {
      toast.error(`Informe quantidade positiva até ${available.toLocaleString("pt-BR")}.`);
      return;
    }
    setReservationLoading(true);
    try {
      const response = await fetch("/api/stock/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "pedido_venda",
          sourceId: selectedSalesOrderId,
          lotId: lot.id,
          quantity,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao reservar lote.");
      setReservations((current) => [result.data, ...current]);
      setReservationLot(null);
      setReservationQuantity("");
      toast.success("Estoque reservado.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReservationLoading(false);
    }
  }

  React.useEffect(() => {
    if (!reservationLot) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !reservationLoading) setReservationLot(null);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [reservationLot, reservationLoading]);

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault();
    const requestKey = transferRequestKey || crypto.randomUUID();
    setTransferRequestKey(requestKey);
    setReservationLoading(true);
    try {
      const response = await fetch("/api/stock/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey,
          fromWarehouseId: transferFrom,
          toWarehouseId: transferTo,
          items: [{ lotId: transferLotId, quantity: Number(transferQuantity) }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha na transferência.");
      toast.success(`Transferência #${result.data.number} concluída.`);
      setTransferQuantity("");
      setTransferRequestKey("");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReservationLoading(false);
    }
  }

  async function calculateSeasonality() {
    if (!selectedProduct?.productId) return;
    setSeasonalityLoading(true);
    try {
      const response = await fetch("/api/stock/seasonality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.productId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao calcular sazonalidade.");
      setSeasonalityRun(result.data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSeasonalityLoading(false);
    }
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const res = await recalculateMetricsAction();
      toast.success(`Métricas preditivas recalculadas para ${res.count} produtos ativos.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao recalcular.");
    } finally {
      setRecalculating(false);
    }
  }

  const tabItems = [
    { key: "matriz", label: "Matriz & Previsão", href: "/estoque?tab=matriz" },
    {
      key: "reservas",
      label: "Reservas",
      href: "/estoque?tab=reservas",
      count: reservations.filter((r) => r.status === "ativa").length,
    },
    { key: "transferencias", label: "Transferências", href: "/estoque?tab=transferencias" },
    {
      key: "retalhos",
      label: "Catálogo de Retalhos (Offcuts)",
      href: "/estoque?tab=retalhos",
      count: remnants.length,
    },
    {
      key: "lotes",
      label: "Lotes & Rastreabilidade",
      href: "/estoque?tab=lotes",
      count: lots.length,
    },
    {
      key: "movimentacoes",
      label: "Movimentações Físicas",
      href: "/estoque?tab=movimentacoes",
      count: movements.length,
    },
    {
      key: "inventario",
      label: "Inventário Cíclico",
      href: "/estoque?tab=inventario",
      count: cycleCountCandidates.length,
    },
    {
      key: "importar",
      label: "Carga Inicial (CSV)",
      href: "/estoque?tab=importar",
    },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Estoque & Retalhos", href: "/estoque" },
          {
            label:
              activeTab === "retalhos"
                ? "Catálogo Técnico de Retalhos"
                : activeTab === "lotes"
                  ? "Lotes & Corridas"
                  : activeTab === "movimentacoes"
                    ? "Trilha de Movimentações"
                    : activeTab === "inventario"
                      ? "Inventário Cíclico"
                      : activeTab === "reservas"
                        ? "Reservas Comerciais"
                        : activeTab === "transferencias"
                          ? "Transferências entre Depósitos"
                          : activeTab === "importar"
                            ? "Carga Inicial CSV"
                            : "Matriz Preditiva de Ruptura",
          },
        ]}
      />

      {/* 2. Top Header & Action Control Bar (Mockup 1:1) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 mb-2 border-b border-carbon-800">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-label-code bg-carbon-800 text-carmine-signal px-2 py-0.5 rounded uppercase font-semibold border border-carbon-700">
              INVENTORY AGENT // MOTOR DE PREVISÃO DE DEMANDA & RASTREABILIDADE 2D/3D
            </span>
            <span className="flex items-center gap-1 font-mono text-label-code text-signal-buy bg-carbon-900 px-2 py-0.5 rounded border border-carbon-800">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-buy animate-pulse" />
              RF-04 ATIVO
            </span>
          </div>

          <h1 className="text-headline-lg font-semibold text-ice-white tracking-tight flex items-center gap-2">
            <span>Estoque Preventivo & Gestão Inteligente de Retalhos</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-1 font-mono text-label-code text-titanium-muted">
            <span>
              Giro Médio (DIO):{" "}
              <strong className="text-ice-white font-mono">
                {kpis.dioDays === null ? "—" : `${kpis.dioDays} dias`}
              </strong>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              Retalhos Rastreados:{" "}
              <strong className="text-signal-buy font-mono">
                {kpis.remnantsTrackedCount} itens (
                {(kpis.remnantsTrackedWeightKg / 1000).toFixed(1)} t)
              </strong>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              Lead Time Médio Fornecedores:{" "}
              <strong className="text-titanium-light font-mono">
                {kpis.avgLeadTimeDays === null ? "—" : `${kpis.avgLeadTimeDays} dias`}
              </strong>
            </span>
          </div>
        </div>

        {/* Quick Actions CTA Buttons (Mockup 1:1) */}
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={() => setMovementDrawerOpen(true)}
              className="flex items-center gap-1.5 bg-carmine-core hover:bg-carmine-signal text-ice-white px-3 py-2 rounded font-mono text-label-caps transition-all shadow-md active:bg-carmine-deep font-semibold"
            >
              <QrCode className="w-4 h-4" />
              <span>NOVO APONTAMENTO [QR SCAN]</span>
              <span className="bg-black/25 text-white px-1 py-0.2 rounded font-mono text-label-code ml-1">
                F1
              </span>
            </button>
          )}

          {canWrite && (
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              className="flex items-center gap-1.5 bg-carbon-800 hover:bg-carbon-700 text-ice-white px-3 py-2 rounded font-mono text-label-caps transition-colors border border-carbon-700"
            >
              <RefreshCw
                className={cn("w-4 h-4 text-signal-hold", recalculating && "animate-spin")}
              />
              <span>{recalculating ? "CALCULANDO..." : "SIMULAR REPOSIÇÃO"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab("inventario");
              router.push("/estoque?tab=inventario");
            }}
            className="flex items-center gap-1.5 bg-carbon-800 hover:bg-carbon-700 text-titanium-light hover:text-ice-white px-2.5 py-2 rounded font-mono text-label-caps transition-colors border border-carbon-700"
            title="Inventário Cíclico & SPED"
          >
            <FileSpreadsheet className="w-4 h-4 text-titanium-muted" />
            <span>SPED / INV CÍCLICO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (remnants.length > 0) setLabelModalRemnant(remnants[0]);
              else toast.info("Nenhum retalho para gerar etiqueta.");
            }}
            className="flex items-center gap-1.5 bg-carbon-800 hover:bg-carbon-700 text-titanium-light hover:text-ice-white px-2.5 py-2 rounded font-mono text-label-caps transition-colors border border-carbon-700"
            title="Gerar Lote de Etiquetas Zebra"
          >
            <Printer className="w-4 h-4 text-titanium-muted" />
            <span>ETIQUETAS PÁTIO</span>
          </button>
        </div>
      </div>

      {/* 3. SECTION 2: 4 KPIS PREVENTIVOS & RENDIMENTO (Mockup 1:1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Card 1: Ruptura Iminente */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-carmine-core/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-code text-carmine-signal uppercase tracking-wider font-semibold">
              Índice de Ruptura Iminente
            </span>
            <AlertTriangle className="w-4 h-4 text-carmine-core" />
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-metric-display text-carmine-signal font-bold">
                {kpis.criticalCount} SKUs
              </span>
              <span className="font-mono text-label-code text-titanium-muted">Críticos</span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">
              Cobertura &lt; Lead Time Fornecedor
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">
              Déficit Potencial: {formatBrl(kpis.potentialDeficitBrl)}
            </span>
            <span className="text-carmine-signal font-semibold">AÇÃO IMEDIATA</span>
          </div>
        </div>

        {/* Card 2: Retalhos Reclassificados */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="absolute -right-3 -top-3 w-16 h-16 bg-signal-buy/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-code text-signal-buy uppercase tracking-wider font-semibold">
              Retalhos Reclassificados (Mês)
            </span>
            <Recycle className="w-4 h-4 text-signal-buy" />
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-metric-display text-signal-buy font-bold">
                {(kpis.remnantsMonthWeightKg / 1000).toFixed(1)} t
              </span>
              {kpis.remnantsMonthVariationPct !== null && (
                <span
                  className={cn(
                    "font-mono text-label-code font-semibold",
                    kpis.remnantsMonthVariationPct >= 0 ? "text-signal-buy" : "text-signal-hold"
                  )}
                >
                  {kpis.remnantsMonthVariationPct >= 0 ? "+" : ""}
                  {kpis.remnantsMonthVariationPct}% vs mês ant.
                </span>
              )}
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">
              Retalhos reservados ou consumidos no mês
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Valor Recuperado:</span>
            <span className="text-ice-white font-semibold">
              {formatBrl(kpis.remnantsMonthValueBrl)}
            </span>
          </div>
        </div>

        {/* Card 3: Capital Parado Envelhecido */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-code text-signal-hold uppercase tracking-wider font-semibold">
              Capital Parado (&gt; 180 dias)
            </span>
            <Hourglass className="w-4 h-4 text-signal-hold" />
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-metric-display text-signal-hold font-bold">
                {formatBrl(kpis.agedCapitalBrl)}
              </span>
              <span className="font-mono text-label-code text-titanium-muted">
                {kpis.agedLotsCount} lotes
              </span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">
              Lotes ativos com entrada há mais de 180 dias
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Saldo × custo unitário do lote</span>
            <button
              type="button"
              onClick={() => {
                setActiveTab("lotes");
                router.push("/estoque?tab=lotes");
              }}
              className="text-titanium-light underline cursor-pointer hover:text-ice-white"
            >
              Ver lotes
            </button>
          </div>
        </div>

        {/* Card 4: Acuracidade Cíclico */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-code text-titanium-light uppercase tracking-wider font-semibold">
              Acuracidade Inventário Cíclico
            </span>
            <Verified className="w-4 h-4 text-tertiary" />
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-metric-display text-ice-white font-bold">
                {accuracyPct === null ? "—" : `${accuracyPct.toFixed(1)}%`}
              </span>
              {accuracyPct !== null && (
                <span
                  className={cn(
                    "font-mono text-label-code font-semibold",
                    accuracyPct >= 98 ? "text-signal-buy" : "text-signal-hold"
                  )}
                >
                  {accuracyPct >= 98 ? "ALTO RIGOR" : "ATENÇÃO"}
                </span>
              )}
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">
              Auditoria algorítmica sem parada fabril
            </div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Último Ciclo Auditado:</span>
            <span className="text-titanium-light">
              {kpis.lastCycleCountAt
                ? new Date(kpis.lastCycleCountAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Nenhum ciclo"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. SECTION 5: MOTOR DE MATCHING AUTOMÁTICO (Hero Inteligente Mockup 1:1) */}
      <AutoMatchingBanner availableRemnants={remnants} onRemnantApproved={() => router.refresh()} />

      {/* 5. Navigation Tabs (Conforme Regras Obrigatórias de Frontend - Seção 7) */}
      <Tabs items={tabItems} active={activeTab} />

      {/* 6. Active Tab Content */}
      {activeTab === "matriz" && (
        <div className="space-y-3">
          <div className="max-w-sm">
            <label className="block text-label-caps text-titanium-muted uppercase mb-1">
              Depósito para saldo e cobertura
            </label>
            <Select
              value={selectedWarehouseId}
              onChange={(event) => setSelectedWarehouseId(event.target.value)}
            >
              <option value="">Consolidado (todos os depósitos)</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-titanium-muted">
              Cobertura local é calculada com disponível neste depósito. Status preditivo permanece
              consolidado; estoque de outro depósito não é tratado como transferível imediatamente.
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
            <div className="xl:col-span-8">
              <PredictiveMatrixTable
                items={matrixItems}
                selectedProductId={selectedProduct?.productId}
                onSelectProduct={(item) => setSelectedProduct(item)}
                onOpenPurchaseSuggestion={(item) => setPoModalItem(item)}
              />
            </div>
            <div className="xl:col-span-4">
              <ForecastChart selectedItem={selectedProduct} />
            </div>
          </div>
          <div className="rounded border border-carbon-800 bg-carbon-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-headline-sm font-semibold text-ice-white">
                  Perfil sazonal mensal · {selectedProduct?.sku ?? "Selecione SKU"}
                </h2>
                <p className="text-xs text-titanium-muted">
                  Método monthly-average-v1 · 2 ciclos anuais · informativo, sem alterar sugestão de
                  compra.
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={!selectedProduct || seasonalityLoading}
                onClick={calculateSeasonality}
              >
                {seasonalityLoading ? "Calculando…" : "Calcular perfil sazonal"}
              </Button>
            </div>
            {seasonalityRun && (
              <div className="mt-3 text-sm">
                <p
                  className={
                    seasonalityRun.result.status === "ready"
                      ? "text-signal-buy"
                      : "text-signal-hold"
                  }
                >
                  {seasonalityRun.result.status === "ready"
                    ? "Previsão disponível"
                    : `Dados insuficientes: ${seasonalityRun.result.reason}`}
                </p>
                <p className="mt-1 text-titanium-muted">
                  Cobertura: {seasonalityRun.coverage.observedMonths}/
                  {seasonalityRun.coverage.requiredMonths} meses completos · janela{" "}
                  {seasonalityRun.window.start} a {seasonalityRun.window.end}
                </p>
                {seasonalityRun.result.monthlyForecast && (
                  <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
                    {seasonalityRun.result.monthlyForecast.map((value: number, index: number) => (
                      <div key={index} className="rounded bg-carbon-950 p-2">
                        <div className="text-titanium-muted">
                          {
                            [
                              "Jan",
                              "Fev",
                              "Mar",
                              "Abr",
                              "Mai",
                              "Jun",
                              "Jul",
                              "Ago",
                              "Set",
                              "Out",
                              "Nov",
                              "Dez",
                            ][index]
                          }
                        </div>
                        <strong>{value.toLocaleString("pt-BR")}</strong>
                        <div className="text-[10px] text-titanium-muted">
                          índice {seasonalityRun.result.seasonalIndex[index].toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="bg-carbon-900 border border-carbon-800 rounded p-4">
            <h2 className="text-headline-sm text-ice-white font-semibold mb-3">
              Saldo por depósito
            </h2>
            <div className="max-w-md mb-3">
              <label className="block text-label-caps text-titanium-muted uppercase mb-1">
                Pedido confirmado para reserva
              </label>
              <Select
                value={selectedSalesOrderId}
                onChange={(event) => setSelectedSalesOrderId(event.target.value)}
              >
                <option value="">Selecione pedido</option>
                {salesOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNumber} · {order.customerName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-titanium-muted text-left">
                    <th className="p-2">SKU</th>
                    <th className="p-2">Depósito</th>
                    <th className="p-2 text-right">Físico</th>
                    <th className="p-2 text-right">Reservado</th>
                    <th className="p-2 text-right">Disponível</th>
                    <th className="p-2 text-right">Cobertura local</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {matrixItems.flatMap((item) =>
                    (item.stockByDepot ?? [])
                      .filter(
                        (row: any) =>
                          !selectedWarehouseId || row.warehouseId === selectedWarehouseId
                      )
                      .map((row: any) => {
                        const lot = lots.find(
                          (candidate) =>
                            candidate.productId === item.productId &&
                            candidate.warehouseId === row.warehouseId &&
                            candidate.status === "ativo"
                        );
                        const avgDaily = Number(item.avgDailyConsumption30d) || 0;
                        const localCoverage =
                          avgDaily > 0 ? Number(row.available) / avgDaily : null;
                        return (
                          <tr
                            key={`${item.productId}:${row.warehouseId}`}
                            className="border-t border-carbon-800"
                          >
                            <td className="p-2 text-ice-white">{item.sku}</td>
                            <td className="p-2">
                              {warehouses.find((w) => w.id === row.warehouseId)?.name ?? "—"}
                            </td>
                            <td className="p-2 text-right">
                              {Number(row.physical).toLocaleString("pt-BR")}
                            </td>
                            <td className="p-2 text-right">
                              {Number(row.reserved).toLocaleString("pt-BR")}
                            </td>
                            <td className="p-2 text-right font-semibold text-signal-buy">
                              {Number(row.available).toLocaleString("pt-BR")}
                            </td>
                            <td className="p-2 text-right">
                              {localCoverage === null
                                ? "Sem consumo"
                                : `${localCoverage.toFixed(1)} dias`}
                            </td>
                            <td className="p-2 text-right">
                              {canWrite && lot && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={reservationLoading}
                                  onClick={() => createReservation(lot)}
                                >
                                  Reservar lote
                                </Button>
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
        </div>
      )}

      {activeTab === "reservas" && (
        <div className="bg-carbon-900 border border-carbon-800 rounded p-4">
          <h2 className="text-headline-sm text-ice-white font-semibold mb-3">
            Reservas registradas
          </h2>
          {reservations.length === 0 ? (
            <p className="text-titanium-muted">Nenhuma reserva registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-titanium-muted text-left">
                    <th className="p-2">SKU</th>
                    <th className="p-2">Depósito</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2">Origem</th>
                    <th className="p-2 text-right">Qtd.</th>
                    <th className="p-2">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => (
                    <tr key={reservation.id} className="border-t border-carbon-800">
                      <td className="p-2">{reservation.sku ?? reservation.productId}</td>
                      <td className="p-2">{reservation.warehouseName}</td>
                      <td className="p-2 font-mono">
                        {lots.find((lot) => lot.id === reservation.lotId)?.lotNumber ??
                          reservation.lotId}
                      </td>
                      <td className="p-2">
                        {reservation.sourceType} · {reservation.sourceId.slice(0, 8)}
                      </td>
                      <td className="p-2 text-right">
                        {Number(reservation.quantity).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-2">{reservation.status}</td>
                      <td className="p-2 text-right">
                        {canWrite && reservation.status === "ativa" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={reservationLoading}
                            onClick={() => releaseReservation(reservation.id)}
                          >
                            Liberar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "transferencias" && (
        <div className="max-w-3xl rounded border border-carbon-800 bg-carbon-900 p-4">
          <h2 className="mb-2 text-headline-sm font-semibold text-ice-white">
            Transferência atômica
          </h2>
          <p className="mb-4 text-sm text-titanium-muted">
            Saída e entrada são registradas na mesma transação. Estoque reservado não pode ser
            transferido.
          </p>
          {!canWrite ? (
            <ReadOnlyNotice />
          ) : (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={submitTransfer}>
              <label className="text-sm text-titanium-muted">
                Origem
                <Select
                  required
                  value={transferFrom}
                  onChange={(event) => {
                    setTransferFrom(event.target.value);
                    setTransferLotId("");
                  }}
                >
                  <option value="">Selecione</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm text-titanium-muted">
                Destino
                <Select
                  required
                  value={transferTo}
                  onChange={(event) => setTransferTo(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {warehouses
                    .filter((warehouse) => warehouse.id !== transferFrom)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="text-sm text-titanium-muted">
                Lote de origem
                <Select
                  required
                  value={transferLotId}
                  onChange={(event) => setTransferLotId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {lots
                    .filter((lot) => lot.warehouseId === transferFrom && lot.status === "ativo")
                    .map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.lotNumber} · {lot.productSku} · saldo {lot.quantityCurrent}
                      </option>
                    ))}
                </Select>
              </label>
              <label className="text-sm text-titanium-muted">
                Quantidade
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={transferQuantity}
                  onChange={(event) => setTransferQuantity(event.target.value)}
                />
              </label>
              <div className="md:col-span-2">
                <Button
                  variant="primary"
                  disabled={reservationLoading || !transferLotId || !transferTo}
                >
                  Transferir atomicamente
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {activeTab === "retalhos" && (
        <RemnantsCatalog
          remnants={remnants}
          canWrite={canWrite}
          onNewRemnant={() => setRemnantDrawerOpen(true)}
          onPrintLabel={(rem) => {
            setLabelObjectType("retalho");
            setLabelModalRemnant(rem);
          }}
          onChanged={() => router.refresh()}
        />
      )}

      {activeTab === "lotes" && (
        <LotsTable
          lots={lots}
          onNewMovement={canWrite ? () => setMovementDrawerOpen(true) : undefined}
          onPrintLabel={
            canWrite
              ? (lot) => {
                  setLabelObjectType("lote");
                  setLabelModalRemnant(lot);
                }
              : undefined
          }
        />
      )}

      {activeTab === "movimentacoes" && <MovementsTable movements={movements} />}

      {activeTab === "inventario" &&
        (canWrite ? (
          <CycleCountView
            candidates={cycleCountCandidates}
            accuracyPct={accuracyPct}
            onCountSubmitted={() => router.refresh()}
          />
        ) : (
          <ReadOnlyNotice />
        ))}

      {activeTab === "importar" &&
        (canWrite ? (
          <StockImportView onImportSuccess={() => router.refresh()} />
        ) : (
          <ReadOnlyNotice />
        ))}

      {/* Modals & Drawers */}
      <MovementDrawer
        isOpen={movementDrawerOpen}
        onClose={() => setMovementDrawerOpen(false)}
        products={products}
        warehouses={warehouses}
        suppliers={suppliers}
        onMovementCreated={() => router.refresh()}
      />

      <RemnantDrawer
        isOpen={remnantDrawerOpen}
        onClose={() => setRemnantDrawerOpen(false)}
        products={products}
        warehouses={warehouses}
        onRemnantCreated={() => router.refresh()}
      />

      <PurchaseSuggestionModal
        isOpen={Boolean(poModalItem)}
        onClose={() => setPoModalItem(null)}
        item={poModalItem}
      />

      <LabelPreviewModal
        isOpen={Boolean(labelModalRemnant)}
        onClose={() => setLabelModalRemnant(null)}
        remnant={labelModalRemnant}
        objectType={labelObjectType}
      />

      {reservationLot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !reservationLoading) {
              setReservationLot(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-reservation-title"
            onSubmit={submitReservation}
            className="w-full max-w-md overflow-hidden rounded border border-carbon-700 bg-carbon-900 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="border-b border-carbon-800 bg-carbon-950/60 p-5">
              <h2
                id="stock-reservation-title"
                className="text-headline-sm font-semibold text-ice-white"
              >
                Reservar estoque
              </h2>
              <p className="mt-1 text-body-sm text-titanium-muted">
                Lote {reservationLot.lotNumber} · {reservationLot.productSku}
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded border border-carbon-800 bg-carbon-950/60 px-3 py-2 text-body-sm text-titanium-light">
                Pedido:{" "}
                <span className="font-medium text-ice-white">
                  {salesOrders.find((order) => order.id === selectedSalesOrderId)?.orderNumber
                    ? `#${salesOrders.find((order) => order.id === selectedSalesOrderId)?.orderNumber}`
                    : "selecionado"}
                </span>
              </div>
              <div>
                <label
                  htmlFor="stock-reservation-quantity"
                  className="mb-1.5 block text-label-caps uppercase text-titanium-muted"
                >
                  Quantidade a reservar
                </label>
                <Input
                  id="stock-reservation-quantity"
                  type="number"
                  inputMode="decimal"
                  min="0.0001"
                  step="any"
                  max={reservationAvailable}
                  value={reservationQuantity}
                  onChange={(event) => setReservationQuantity(event.target.value)}
                  placeholder="Ex.: 2,5"
                  autoFocus
                  required
                />
                <p className="mt-1.5 text-label-code text-titanium-muted">
                  Saldo disponível: {reservationAvailable.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-carbon-800 bg-carbon-950/60 p-4">
              <Button
                type="button"
                variant="secondary"
                disabled={reservationLoading}
                onClick={() => setReservationLot(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={reservationLoading || !reservationQuantity}
              >
                {reservationLoading ? "Reservando…" : "Confirmar reserva"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
