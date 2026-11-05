"use client";

import * as React from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { sma } from "@/lib/market/indicators";
import { fmtNum } from "@/lib/market/format";
import { themeColor } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketChartProps {
  bars: ChartBar[];
  mode: "candles" | "line";
  showSma20: boolean;
  showSma50: boolean;
  avgPaid: number | null;
  decimals?: number;
  rangeDays?: number | null;
}

// A lib de gráfico não lê classes Tailwind nem variáveis CSS: as cores saem dos tokens do tema ativo.
function chartColors() {
  return {
    text: themeColor("titanium-muted"),
    grid: themeColor("ice-white", 0.06),
    border: themeColor("ice-white", 0.1),
    up: themeColor("signal-buy"),
    down: themeColor("signal-risk"),
    line: themeColor("ice-white"),
    sma20: themeColor("signal-hold"),
    sma50: themeColor("titanium-light"),
    paid: "rgb(220, 38, 38)",
  };
}

export function MarketChart({
  bars,
  mode,
  showSma20,
  showSma50,
  avgPaid,
  decimals = 2,
  rangeDays = null,
}: MarketChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [legend, setLegend] = React.useState<string>("");
  const theme = useTheme();

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || bars.length === 0) return;
    const COLORS = chartColors();

    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORS.text,
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: COLORS.border },
      timeScale: { borderColor: COLORS.border, timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        priceFormatter: (p: number) => fmtNum(p, decimals),
        locale: "pt-BR",
      },
    });

    const priceFormat = {
      type: "price" as const,
      precision: decimals,
      minMove: 1 / 10 ** decimals,
    };
    let main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;
    if (mode === "candles") {
      const s = chart.addCandlestickSeries({
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
        priceFormat,
      });
      s.setData(bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })));
      main = s;
    } else {
      const s = chart.addLineSeries({ color: COLORS.line, lineWidth: 2, priceFormat });
      s.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
      main = s;
    }

    const closes = bars.map((b) => ({ time: b.time, value: b.close }));
    const overlays: { key: string; label: string; series: ISeriesApi<"Line"> }[] = [];
    const addSma = (period: number, color: string) => {
      const s = chart.addLineSeries({
        color,
        lineWidth: 1,
        priceFormat,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(sma(closes, period).map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      overlays.push({ key: `sma${period}`, label: `SMA ${period}`, series: s });
    };
    if (showSma20) addSma(20, COLORS.sma20);
    if (showSma50) addSma(50, COLORS.sma50);

    if (avgPaid != null && avgPaid > 0) {
      main.createPriceLine({
        price: avgPaid,
        color: COLORS.paid,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Referência manual",
      });
    }

    if (rangeDays && bars.length > 1) {
      const lastTime = bars[bars.length - 1].time;
      chart.timeScale().setVisibleRange({
        from: (lastTime - rangeDays * 86_400) as UTCTimestamp,
        to: lastTime as UTCTimestamp,
      });
    } else {
      chart.timeScale().fitContent();
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setLegend("");
        return;
      }
      const d = param.seriesData.get(main) as
        { open?: number; high?: number; low?: number; close?: number; value?: number } | undefined;
      if (!d) return;
      const date = new Date((param.time as number) * 1000).toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      });
      const parts =
        d.close != null
          ? [
              `A ${fmtNum(d.open, decimals)}`,
              `M ${fmtNum(d.high, decimals)}`,
              `m ${fmtNum(d.low, decimals)}`,
              `F ${fmtNum(d.close, decimals)}`,
            ]
          : [`F ${fmtNum(d.value, decimals)}`];
      for (const o of overlays) {
        const v = (param.seriesData.get(o.series) as { value?: number } | undefined)?.value;
        if (v != null) parts.push(`${o.label} ${fmtNum(v, decimals)}`);
      }
      setLegend(`${date}  ·  ${parts.join("  ")}`);
    });

    return () => chart.remove();
  }, [bars, mode, showSma20, showSma50, avgPaid, decimals, rangeDays, theme]);

  return (
    <div className="relative h-[360px] w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {legend && (
        <div className="pointer-events-none absolute left-2 top-1 z-10 rounded bg-carbon-950/80 px-2 py-0.5 font-mono text-label-code text-titanium-light">
          {legend}
        </div>
      )}
    </div>
  );
}
