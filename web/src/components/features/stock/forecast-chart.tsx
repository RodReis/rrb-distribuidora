"use client";

import * as React from "react";

export interface ForecastChartProps {
  selectedItem?: {
    sku: string;
    description: string;
    currentStockQty: number;
    avgDailyConsumption30d: number;
    leadTimeDays: number;
    coverageDays: number;
    predictiveStatus: string;
  } | null;
}

export function ForecastChart({ selectedItem }: ForecastChartProps) {
  const item = selectedItem || {
    sku: "CG-A36-1270",
    description: "Chapa Grossa A36 1/2\" (12.70mm)",
    currentStockQty: 18.5,
    avgDailyConsumption30d: 2.2,
    leadTimeDays: 14,
    coverageDays: 8,
    predictiveStatus: "CRITICAL_RUPTURE",
  };

  const coverageDays = Number(item.coverageDays) || 8;
  const leadTimeDays = Number(item.leadTimeDays) || 14;
  const isCritical = coverageDays < leadTimeDays;

  // Calculate rupture date
  const ruptureDate = new Date();
  ruptureDate.setDate(ruptureDate.getDate() + Math.max(1, Math.round(coverageDays)));
  const formattedRuptureDate = ruptureDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-label-caps text-titanium-light font-semibold uppercase">
            PROJEÇÃO PROPHET (45 DIAS)
          </span>
          <span className="font-mono text-label-code text-signal-buy bg-carbon-950 px-1.5 py-0.5 rounded border border-carbon-800">
            CI: 95%
          </span>
        </div>
        <div className="text-headline-sm font-semibold text-ice-white truncate">
          {item.description}
        </div>
        <p className="text-body-sm text-titanium-muted mt-0.5">
          Demanda diária esperada vs estoque projetado até colapso em D+{Math.round(coverageDays)}.
        </p>

        {/* Inline SVG Chart */}
        <div className="w-full mt-3 bg-carbon-950 border border-carbon-800 p-2.5 rounded">
          <svg className="w-full h-32 overflow-visible" viewBox="0 0 320 130">
            <defs>
              <linearGradient id="ruptureZone" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="safeZone" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            <line stroke="#222733" strokeDasharray="2 2" strokeWidth="1" x1="10" x2="310" y1="10" y2="10" />
            <line stroke="#222733" strokeDasharray="2 2" strokeWidth="1" x1="10" x2="310" y1="50" y2="50" />
            <line stroke="#222733" strokeDasharray="2 2" strokeWidth="1" x1="10" x2="310" y1="90" y2="90" />
            <line stroke="#222733" strokeWidth="1" x1="10" x2="310" y1="120" y2="120" />

            {/* Rupture Threshold Line */}
            <line stroke="#DC2626" strokeDasharray="3 3" strokeWidth="1.5" x1="10" x2="310" y1="75" y2="75" />
            <text fill="#DC2626" fontFamily="JetBrains Mono" fontSize="8" fontWeight="600" x="220" y="71">
              ESTOQUE CRÍTICO
            </text>

            {/* Confidence Interval Shadow (Prophet) */}
            <path
              d="M 135 55 L 175 66 L 215 80 L 255 93 L 295 102 L 295 125 L 255 119 L 215 108 L 175 88 L 135 70 Z"
              fill={isCritical ? "#DC2626" : "#10B981"}
              fillOpacity="0.12"
            />

            {/* Projected Stock Depletion Path */}
            <path
              d="M 15 25 L 55 35 L 95 48 L 135 62 L 175 75 L 215 92 L 255 106 L 295 118"
              fill="none"
              stroke={isCritical ? "#DC2626" : "#10B981"}
              strokeWidth="2.5"
            />

            {/* Point of Rupture Beacon */}
            <circle cx="175" cy="75" fill={isCritical ? "#DC2626" : "#10B981"} r="4.5" />
            <circle cx="175" cy="75" fill={isCritical ? "#DC2626" : "#10B981"} fillOpacity="0.3" r="8" className="animate-ping" />
            <text fill="#F8FAFC" fontFamily="JetBrains Mono" fontSize="9" fontWeight="600" x="160" y="94">
              D+{Math.round(coverageDays)}
            </text>

            {/* X Axis Labels */}
            <text fill="#94A3B8" fontFamily="JetBrains Mono" fontSize="8" x="15" y="128">Hoje</text>
            <text fill="#94A3B8" fontFamily="JetBrains Mono" fontSize="8" x="100" y="128">+15d</text>
            <text fill="#94A3B8" fontFamily="JetBrains Mono" fontSize="8" x="195" y="128">+30d</text>
            <text fill="#94A3B8" fontFamily="JetBrains Mono" fontSize="8" x="280" y="128">+45d</text>
          </svg>
        </div>
      </div>

      <div className="mt-3 pt-2 flex flex-col gap-1.5 font-mono text-label-code text-titanium-muted border-t border-carbon-800">
        <div className="flex items-center justify-between">
          <span>Estoque em D+{Math.round(coverageDays)} (Projetado):</span>
          <span className={isCritical ? "text-carmine-signal font-semibold" : "text-signal-buy font-semibold"}>
            0.9 t ({isCritical ? "Abaixo do Mínimo" : "Estável"})
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ponto Crítico sem Pedido:</span>
          <span className={isCritical ? "text-carmine-signal font-bold" : "text-ice-white font-bold"}>
            {formattedRuptureDate}
          </span>
        </div>
        <div className="flex items-center justify-between text-titanium-light pt-0.5">
          <span>Lead Time Homologado:</span>
          <span className="font-mono text-metric-compact text-ice-white">
            {leadTimeDays} dias úteis
          </span>
        </div>
      </div>
    </div>
  );
}
