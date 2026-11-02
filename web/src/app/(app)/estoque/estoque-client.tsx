"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  QrCode,
  Radar,
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
  accuracyPct: number;
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
}: EstoqueClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState(initialTab);

  // Selected item for forecast chart
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(
    matrixItems.find((i) => i.predictiveStatus === "CRITICAL_RUPTURE") || matrixItems[0] || null
  );

  // Drawers and Modals
  const [movementDrawerOpen, setMovementDrawerOpen] = React.useState(false);
  const [remnantDrawerOpen, setRemnantDrawerOpen] = React.useState(false);
  const [poModalItem, setPoModalItem] = React.useState<any | null>(null);
  const [labelModalRemnant, setLabelModalRemnant] = React.useState<any | null>(null);
  const [recalculating, setRecalculating] = React.useState(false);

  // KPI calculations
  const criticalItems = matrixItems.filter(
    (i) => i.predictiveStatus === "CRITICAL_RUPTURE" || Number(i.coverageDays) < Number(i.leadTimeDays)
  );
  const criticalCount = criticalItems.length;

  const totalRemnantsWeight = remnants.reduce(
    (acc, r) => acc + (Number(r.weightKg) || 0),
    0
  );

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
            <span className="flex items-center gap-1 text-titanium-light">
              <Radar className="w-3.5 h-3.5 text-tertiary" />
              Varredura de Galpão: <span className="text-tertiary font-semibold">Ativa (LIDAR + RFID)</span>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              Giro Médio (DIO): <strong className="text-ice-white font-mono">41 dias</strong>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              Retalhos Rastreados:{" "}
              <strong className="text-signal-buy font-mono">
                {remnants.length} itens ({(totalRemnantsWeight / 1000).toFixed(1)} t)
              </strong>
            </span>
            <span className="text-carbon-700">•</span>
            <span>
              Lead Time Médio Fornecedores: <strong className="text-titanium-light font-mono">14.2 dias</strong>
            </span>
          </div>
        </div>

        {/* Quick Actions CTA Buttons (Mockup 1:1) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMovementDrawerOpen(true)}
            className="flex items-center gap-1.5 bg-carmine-core hover:bg-carmine-signal text-ice-white px-3 py-2 rounded font-mono text-label-caps transition-all shadow-md active:bg-carmine-deep font-semibold"
          >
            <QrCode className="w-4 h-4" />
            <span>NOVO APONTAMENTO [QR SCAN]</span>
            <span className="bg-carbon-950/40 text-titanium-light px-1 py-0.2 rounded font-mono text-label-code ml-1">
              F1
            </span>
          </button>

          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-1.5 bg-carbon-800 hover:bg-carbon-700 text-ice-white px-3 py-2 rounded font-mono text-label-caps transition-colors border border-carbon-700"
          >
            <RefreshCw className={cn("w-4 h-4 text-signal-hold", recalculating && "animate-spin")} />
            <span>{recalculating ? "CALCULANDO..." : "SIMULAR REPOSIÇÃO"}</span>
          </button>

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
                {criticalCount} SKUs
              </span>
              <span className="font-mono text-label-code text-titanium-muted">Críticos</span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">Cobertura &lt; Lead Time Fornecedor</div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Déficit Potencial: R$ 380k</span>
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
                42.8 t
              </span>
              <span className="font-mono text-label-code text-signal-buy font-semibold">+18% vs mês ant.</span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">Salvas de sucata primária p/ OPs ativas</div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Valor Recuperado:</span>
            <span className="text-ice-white font-semibold">R$ 248.500,00</span>
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
                R$ 94.200
              </span>
              <span className="font-mono text-label-code text-titanium-muted">18.2 t</span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">Sobras em risco de oxidação severa</div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-signal-buy">Redução de -24% pós IA</span>
            <span
              onClick={() => {
                setActiveTab("retalhos");
                router.push("/estoque?tab=retalhos");
              }}
              className="text-titanium-light underline cursor-pointer hover:text-ice-white"
            >
              Liquidar em OP
            </span>
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
                {accuracyPct.toFixed(1)}%
              </span>
              <span className="font-mono text-label-code text-signal-buy font-semibold">ALTO RIGOR</span>
            </div>
            <div className="text-body-sm text-titanium-light mt-0.5">Auditoria algorítmica sem parada fabril</div>
          </div>
          <div className="flex items-center justify-between pt-1.5 bg-carbon-950/60 -mx-3.5 -mb-3.5 px-3.5 py-1.5 border-t border-carbon-800 font-mono text-label-code">
            <span className="text-titanium-muted">Último Ciclo Auditado:</span>
            <span className="text-titanium-light">Hoje, 06:00 BRT</span>
          </div>
        </div>
      </div>

      {/* 4. SECTION 5: MOTOR DE MATCHING AUTOMÁTICO (Hero Inteligente Mockup 1:1) */}
      <AutoMatchingBanner
        availableRemnants={remnants}
        onRemnantApproved={() => router.refresh()}
      />

      {/* 5. Navigation Tabs (Conforme Regras Obrigatórias de Frontend - Seção 7) */}
      <Tabs items={tabItems} active={activeTab} />

      {/* 6. Active Tab Content */}
      {activeTab === "matriz" && (
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
      )}

      {activeTab === "retalhos" && (
        <RemnantsCatalog
          remnants={remnants}
          onNewRemnant={() => setRemnantDrawerOpen(true)}
          onPrintLabel={(rem) => setLabelModalRemnant(rem)}
          onReserveRemnant={(rem) => toast.success(`Retalho #${rem.code} reservado com sucesso.`)}
        />
      )}

      {activeTab === "lotes" && (
        <LotsTable
          lots={lots}
          onNewMovement={() => setMovementDrawerOpen(true)}
        />
      )}

      {activeTab === "movimentacoes" && (
        <MovementsTable movements={movements} />
      )}

      {activeTab === "inventario" && (
        <CycleCountView
          candidates={cycleCountCandidates}
          accuracyPct={accuracyPct}
          onCountSubmitted={() => router.refresh()}
        />
      )}

      {activeTab === "importar" && (
        <StockImportView onImportSuccess={() => router.refresh()} />
      )}

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
      />
    </div>
  );
}
