"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { MarketChart, type ChartBar } from "./market-chart";
import type { Quote } from "@/lib/market/queries";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import { calculateParity } from "@/lib/market/parity-calculator";
import { PARITY_DEFAULTS } from "@/lib/market/parity-defaults";
import { deltaTone, fmtBrl, fmtNum, fmtPct, fmtUsd } from "@/lib/market/format";

const RANGES = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "1A", days: 365 },
  { key: "2A", days: 730 },
  { key: "MÁX", days: null },
] as const;

const FULL_FROM = "2000-01-01";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-carbon-800", className)} />;
}

function MetricTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-carbon-800 bg-carbon-900 p-3">
      <div className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-metric-display text-ice-white">{value}</span>
        {delta !== undefined && (
          <span className={cn("font-mono text-body-sm", deltaTone(delta))}>{fmtPct(delta)}</span>
        )}
      </div>
      {hint && <div className="mt-0.5 font-mono text-label-code text-titanium-dark">{hint}</div>}
    </div>
  );
}

export function MarketTerminal({ initialQuotes }: { initialQuotes: Quote[] }) {
  const [quotes, setQuotes] = React.useState(initialQuotes);
  const [symbol, setSymbol] = React.useState<string>(
    initialQuotes.find((q) => q.symbol === ASSET_SYMBOLS.HRC_US)?.symbol ??
      initialQuotes[0]?.symbol ??
      ""
  );
  const [range, setRange] = React.useState<(typeof RANGES)[number]["key"]>("1A");
  const [mode, setMode] = React.useState<"candles" | "line">("candles");
  const [sma20, setSma20] = React.useState(true);
  const [sma50, setSma50] = React.useState(true);
  const [avgPaidInput, setAvgPaidInput] = React.useState("");

  const cache = React.useRef(new Map<string, ChartBar[]>());
  const [bars, setBars] = React.useState<ChartBar[] | null>(null);
  const [error, setError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    setAvgPaidInput(localStorage.getItem(`market:avgPaid:${symbol}`) ?? "");
  }, [symbol]);

  const loadSeries = React.useCallback(async (sym: string, force = false) => {
    if (!force && cache.current.has(sym)) {
      setBars(cache.current.get(sym)!);
      setError(false);
      return;
    }
    setBars(null);
    setError(false);
    try {
      const res = await fetch(`/api/market/series/${encodeURIComponent(sym)}?from=${FULL_FROM}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { bars: ChartBar[] };
      cache.current.set(sym, data.bars);
      setBars(data.bars);
    } catch {
      setError(true);
      toast.error("Não foi possível carregar a série de preços. Tente novamente.");
    }
  }, []);

  React.useEffect(() => {
    if (symbol) void loadSeries(symbol);
  }, [symbol, loadSeries]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/market/quotes");
      if (!res.ok) throw new Error();
      setQuotes(((await res.json()) as { quotes: Quote[] }).quotes);
      cache.current.clear();
      await loadSeries(symbol, true);
      toast.success("Cotações atualizadas.");
    } catch {
      toast.error("Não foi possível atualizar as cotações.");
    } finally {
      setRefreshing(false);
    }
  }

  const bySymbol = React.useMemo(() => new Map(quotes.map((q) => [q.symbol, q])), [quotes]);
  const ptax = bySymbol.get(ASSET_SYMBOLS.PTAX);
  const alu = bySymbol.get(ASSET_SYMBOLS.LME_ALU);
  const hrcUs = bySymbol.get(ASSET_SYMBOLS.HRC_US);
  const hrcCn = bySymbol.get(ASSET_SYMBOLS.HRC_CN);

  const brazilCostPerKg = React.useMemo(() => {
    if (!ptax?.last || !hrcCn?.last) return null;
    return calculateParity({ ...PARITY_DEFAULTS, fobUsdPerTon: hrcCn.last, ptax: ptax.last })
      .landedBrlPerKg;
  }, [ptax, hrcCn]);

  const current = bySymbol.get(symbol);
  const decimals = current?.unit === "ptax" ? 4 : 2;
  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const avgPaid = Number(avgPaidInput.replace(",", ".")) || null;

  function saveAvgPaid(v: string) {
    setAvgPaidInput(v);
    localStorage.setItem(`market:avgPaid:${symbol}`, v);
  }

  if (quotes.length === 0 || quotes.every((q) => q.last == null)) {
    return (
      <EmptyState
        title="Nenhuma cotação disponível"
        description="Execute a carga inicial (pnpm db:seed-market) ou aguarde a próxima ingestão automática."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Dólar PTAX"
          value={fmtBrl(ptax?.last, 4)}
          delta={ptax?.change24h}
          hint="BCB · venda"
        />
        <MetricTile
          label="LME Alumínio (US$/t)"
          value={fmtNum(alu?.last)}
          delta={alu?.change24h}
          hint="LME · fechamento"
        />
        <MetricTile
          label="HRC US (US$/t)"
          value={fmtNum(hrcUs?.last)}
          delta={hrcUs?.change24h}
          hint="CME"
        />
        <MetricTile
          label="Custo Brasil Est. (R$/kg)"
          value={fmtNum(brazilCostPerKg, 3)}
          hint="HRC China desembarcado, líquido de créditos"
        />
      </div>

      <section className="rounded-md border border-carbon-800 bg-carbon-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon-800 p-3">
          <div>
            <div className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
              {current?.market} · {current?.unit}
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-headline-sm text-ice-white">{current?.name}</h2>
              <span className="font-mono text-metric-display text-ice-white">
                {fmtNum(current?.last, decimals)}
              </span>
              <span className={cn("font-mono text-body-md", deltaTone(current?.change24h))}>
                {fmtPct(current?.change24h)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Período"
              className="flex overflow-hidden rounded border border-carbon-700"
            >
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "h-7 px-2.5 font-mono text-label-code transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core cursor-pointer",
                    range === r.key
                      ? "bg-carmine-core text-ice-white"
                      : "bg-carbon-950 text-titanium-muted hover:text-ice-white"
                  )}
                >
                  {r.key}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label="Tipo de gráfico"
              className="flex overflow-hidden rounded border border-carbon-700"
            >
              {(["candles", "line"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-7 px-2.5 font-mono text-label-code transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core cursor-pointer",
                    mode === m
                      ? "bg-carbon-700 text-ice-white"
                      : "bg-carbon-950 text-titanium-muted hover:text-ice-white"
                  )}
                >
                  {m === "candles" ? "CANDLE" : "LINHA"}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshAll}
              disabled={refreshing}
              aria-label="Atualizar cotações"
            >
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-carbon-800 px-3 py-2">
          <Checkbox checked={sma20} onChange={setSma20} label="SMA 20" />
          <Checkbox checked={sma50} onChange={setSma50} label="SMA 50" />
          <label className="ml-auto flex items-center gap-2 font-mono text-label-code uppercase tracking-wider text-titanium-muted">
            Preço médio pago [{current?.baseCurrency}]
            <Input
              inputMode="decimal"
              value={avgPaidInput}
              onChange={(e) => saveAvgPaid(e.target.value)}
              placeholder="opcional"
              className="h-7 w-28 font-mono text-body-sm"
            />
          </label>
        </div>

        <div className="p-2">
          {error ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-3 text-titanium-muted">
              <p className="text-body-md">Falha ao carregar a série.</p>
              <Button variant="secondary" size="sm" onClick={() => loadSeries(symbol, true)}>
                Tentar novamente
              </Button>
            </div>
          ) : bars === null ? (
            <Skeleton className="h-[360px] w-full" />
          ) : bars.length === 0 ? (
            <div className="flex h-[360px] items-center justify-center text-body-md text-titanium-muted">
              Sem dados para este ativo.
            </div>
          ) : (
            <MarketChart
              bars={bars}
              mode={mode}
              showSma20={sma20}
              showSma50={sma50}
              avgPaid={avgPaid}
              decimals={decimals}
              rangeDays={rangeDays}
            />
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-carbon-800 bg-carbon-900">
        <div className="border-b border-carbon-800 px-3 py-2 text-headline-sm text-ice-white">
          Radar de Cotações
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-carbon-950 text-left font-mono text-label-code uppercase tracking-wider text-titanium-muted">
                <th className="px-3 py-2 font-semibold">Ativo</th>
                <th className="px-3 py-2 font-semibold">Mercado</th>
                <th className="px-3 py-2 text-right font-semibold">Último</th>
                <th className="px-3 py-2 text-right font-semibold">24h</th>
                <th className="px-3 py-2 text-right font-semibold">7D</th>
                <th className="px-3 py-2 text-right font-semibold">30D</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr
                  key={q.symbol}
                  tabIndex={0}
                  aria-selected={q.symbol === symbol}
                  onClick={() => setSymbol(q.symbol)}
                  onKeyDown={(e) => e.key === "Enter" && setSymbol(q.symbol)}
                  className={cn(
                    "h-9 cursor-pointer transition-colors hover:bg-carbon-700/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-carmine-core",
                    i % 2 === 0 ? "bg-carbon-900" : "bg-carbon-800/40",
                    q.symbol === symbol && "bg-carbon-700"
                  )}
                >
                  <td className="px-3 text-ice-white">{q.name}</td>
                  <td className="px-3 font-mono text-titanium-muted">{q.market}</td>
                  <td className="px-3 text-right font-mono text-ice-white">
                    {q.baseCurrency === "BRL" ? fmtBrl(q.last, 4) : fmtUsd(q.last)}
                  </td>
                  <td className={cn("px-3 text-right font-mono", deltaTone(q.change24h))}>
                    {fmtPct(q.change24h)}
                  </td>
                  <td className={cn("px-3 text-right font-mono", deltaTone(q.change7d))}>
                    {fmtPct(q.change7d)}
                  </td>
                  <td className={cn("px-3 text-right font-mono", deltaTone(q.change30d))}>
                    {fmtPct(q.change30d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
