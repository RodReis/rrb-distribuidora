"use client";

import * as React from "react";

export interface ForecastChartItem {
  sku: string;
  commercialDescription: string;
  unit?: string;
  currentStockQty: string | number;
  avgDailyConsumption30d: string | number;
  leadTimeDays: number;
  coverageDays: string | number;
  safetyStockQty?: string | number;
  reorderPointQty?: string | number;
  predictiveStatus: string;
}

export interface ForecastChartProps {
  selectedItem?: ForecastChartItem | null;
}

const HORIZON_DAYS = 45;
const X0 = 15;
const X1 = 295;
const Y_TOP = 12;
const Y_BASE = 118;

export function ForecastChart({ selectedItem }: ForecastChartProps) {
  if (!selectedItem) {
    return (
      <div className="bg-carbon-900 border border-carbon-800 rounded p-4 text-body-sm text-titanium-muted">
        Selecione um item da matriz para ver a projeção de estoque.
      </div>
    );
  }

  const item = selectedItem;
  const unit = item.unit || "t";
  const stock = Number(item.currentStockQty) || 0;
  const daily = Number(item.avgDailyConsumption30d) || 0;
  const leadTime = Number(item.leadTimeDays) || 0;
  const coverage = Number(item.coverageDays) || 0;
  const safety = Number(item.safetyStockQty) || 0;
  const rop = Number(item.reorderPointQty) || 0;
  const isCritical = item.predictiveStatus === "CRITICAL_RUPTURE";
  const lineClass = isCritical ? "stroke-carmine-core" : "stroke-signal-buy";
  const dotClass = isCritical ? "fill-carmine-core" : "fill-signal-buy";

  const yMax = Math.max(stock, rop, safety, 1);
  const xAt = (day: number) => X0 + (day / HORIZON_DAYS) * (X1 - X0);
  const yAt = (qty: number) => Y_BASE - (Math.max(0, qty) / yMax) * (Y_BASE - Y_TOP);

  const points = Array.from({ length: HORIZON_DAYS + 1 }, (_, day) => {
    const qty = Math.max(0, stock - daily * day);
    return `${xAt(day).toFixed(1)} ${yAt(qty).toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;

  const ruptureDay = daily > 0 ? stock / daily : null;
  const ruptureInHorizon = ruptureDay !== null && ruptureDay <= HORIZON_DAYS;
  const ruptureDate =
    ruptureDay !== null ? new Date(Date.now() + ruptureDay * 24 * 60 * 60 * 1000) : null;
  const fmtQty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-label-caps text-titanium-light font-semibold uppercase">
            PROJEÇÃO DE ESTOQUE ({HORIZON_DAYS} DIAS)
          </span>
          <span className="font-mono text-label-code text-titanium-muted bg-carbon-950 px-1.5 py-0.5 rounded border border-carbon-800">
            Z = 1,645
          </span>
        </div>
        <div className="text-headline-sm font-semibold text-ice-white truncate">
          {item.commercialDescription}
        </div>
        <p className="text-body-sm text-titanium-muted mt-0.5">
          {ruptureInHorizon
            ? `Consumo médio constante: estoque zera em D+${Math.round(ruptureDay!)}.`
            : "Consumo médio constante: sem ruptura dentro do horizonte."}
        </p>

        <div className="w-full mt-3 bg-carbon-950 border border-carbon-800 p-2.5 rounded">
          <svg
            className="w-full h-32 overflow-visible"
            viewBox="0 0 320 130"
            role="img"
            aria-label="Projeção linear do estoque"
          >
            <line
              className="stroke-carbon-700"
              strokeWidth="1"
              x1={X0}
              x2={X1}
              y1={Y_BASE}
              y2={Y_BASE}
            />

            {safety > 0 && (
              <>
                <line
                  className="stroke-carmine-core"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  x1={X0}
                  x2={X1}
                  y1={yAt(safety)}
                  y2={yAt(safety)}
                />
                <text
                  className="fill-carmine-core"
                  fontFamily="JetBrains Mono"
                  fontSize="8"
                  fontWeight="600"
                  x={X1 - 80}
                  y={yAt(safety) - 4}
                >
                  ESTOQUE DE SEGURANÇA
                </text>
              </>
            )}

            {rop > 0 && (
              <line
                className="stroke-signal-hold"
                strokeDasharray="2 3"
                strokeWidth="1"
                x1={X0}
                x2={X1}
                y1={yAt(rop)}
                y2={yAt(rop)}
              />
            )}

            {leadTime > 0 && leadTime <= HORIZON_DAYS && (
              <line
                className="stroke-titanium-dark"
                strokeDasharray="2 2"
                strokeWidth="1"
                x1={xAt(leadTime)}
                x2={xAt(leadTime)}
                y1={Y_TOP}
                y2={Y_BASE}
              />
            )}

            <path className={lineClass} d={path} fill="none" strokeWidth="2.5" />

            {ruptureInHorizon && (
              <>
                <circle className={dotClass} cx={xAt(ruptureDay!)} cy={Y_BASE} r="4.5" />
                <text
                  className="fill-ice-white"
                  fontFamily="JetBrains Mono"
                  fontSize="9"
                  fontWeight="600"
                  x={Math.min(xAt(ruptureDay!) - 10, X1 - 24)}
                  y={Y_BASE - 8}
                >
                  D+{Math.round(ruptureDay!)}
                </text>
              </>
            )}

            <text
              className="fill-titanium-muted"
              fontFamily="JetBrains Mono"
              fontSize="8"
              x={X0}
              y="128"
            >
              Hoje
            </text>
            <text
              className="fill-titanium-muted"
              fontFamily="JetBrains Mono"
              fontSize="8"
              x={xAt(15) - 8}
              y="128"
            >
              +15d
            </text>
            <text
              className="fill-titanium-muted"
              fontFamily="JetBrains Mono"
              fontSize="8"
              x={xAt(30) - 8}
              y="128"
            >
              +30d
            </text>
            <text
              className="fill-titanium-muted"
              fontFamily="JetBrains Mono"
              fontSize="8"
              x={X1 - 16}
              y="128"
            >
              +45d
            </text>
          </svg>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-label-code text-titanium-muted">
          <span>
            <span className="text-signal-hold">- -</span> Ponto de pedido
          </span>
          <span>
            <span className="text-carmine-signal">- -</span> Estoque de segurança
          </span>
          <span>
            <span className="text-titanium-dark">¦</span> Lead time
          </span>
        </div>
      </div>

      <div className="mt-3 pt-2 flex flex-col gap-1.5 font-mono text-label-code text-titanium-muted border-t border-carbon-800">
        <div className="flex items-center justify-between">
          <span>Estoque atual:</span>
          <span className="text-ice-white font-semibold">
            {fmtQty(stock)} {unit}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ponto de pedido (ROP):</span>
          <span className="text-signal-hold font-semibold">
            {fmtQty(rop)} {unit}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ruptura prevista:</span>
          <span
            className={isCritical ? "text-carmine-signal font-bold" : "text-ice-white font-bold"}
          >
            {ruptureDate ? ruptureDate.toLocaleDateString("pt-BR") : "Sem consumo"}
          </span>
        </div>
        <div className="flex items-center justify-between text-titanium-light pt-0.5">
          <span>Lead time / cobertura:</span>
          <span className="text-ice-white">
            {leadTime} d / {coverage >= 999 ? "∞" : `${coverage} d`}
          </span>
        </div>
      </div>
    </div>
  );
}
