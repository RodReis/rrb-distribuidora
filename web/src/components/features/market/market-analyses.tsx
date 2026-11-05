"use client";

import { useState } from "react";

type Asset = { symbol: string; name: string };
type Result = {
  result: {
    methodVersion: string;
    months?: {
      month: number;
      count: number;
      eligible: boolean;
      mean: number | null;
      dispersion: number | null;
    }[];
    lagBusinessDays?: number;
    count?: number;
    coefficient?: number | null;
    confidence95?: number[] | null;
  };
  coverage: {
    left: number;
    right: number | null;
    from: string;
    to: string;
    timezone: string;
    frequency: string;
  };
  series: {
    symbol: string;
    name: string;
    source: string;
    currency: string;
    unit: string;
    exportTo: string;
  }[];
  sourceSnapshotHash: string;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MarketAnalyses({ assets }: { assets: Asset[] }) {
  const [kind, setKind] = useState<"sazonalidade" | "correlacao" | "spread">("sazonalidade");
  const [symbol, setSymbol] = useState(assets[0]?.symbol ?? "");
  const [second, setSecond] = useState(assets[1]?.symbol ?? "");
  const [from, setFrom] = useState("2023-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [lag, setLag] = useState("0");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const exportWindow = new URLSearchParams({
    from: `${from}T00:00:00Z`,
    to: `${to}T23:59:59Z`,
    format: "csv",
  });

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setData(null);
    setError("");
    setBusy(true);
    const params = new URLSearchParams({
      symbol,
      second,
      lag,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
      source: "manual",
    });
    try {
      const response = await fetch(`/api/market/analyses/${kind}?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha na análise.");
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na análise.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" aria-label="Análises de mercado">
      <div className="border-b border-carbon-800 pb-4">
        <h2 className="text-xl font-semibold text-ice-white">Análises históricas</h2>
        <p className="mt-1 text-body-sm text-titanium-muted">
          Exploração de séries importadas por sua empresa. Associação não indica causalidade.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de análise">
        {(["sazonalidade", "correlacao", "spread"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            className={`rounded px-3 py-2 text-body-sm ${kind === value ? "bg-carmine-core text-white" : "bg-carbon-900 text-titanium-light hover:text-white"}`}
            onClick={() => {
              setKind(value);
              setData(null);
              setError("");
            }}
          >
            {value === "correlacao"
              ? "Correlação"
              : value === "sazonalidade"
                ? "Sazonalidade"
                : "Spread"}
          </button>
        ))}
      </div>
      {assets.length === 0 && (
        <p className="rounded-md border border-carbon-700 bg-carbon-900 p-4 text-body-sm text-titanium-light">
          Nenhuma série própria importada. Importe preços no Terminal de Mercado para iniciar
          análise.
        </p>
      )}
      {kind === "spread" ? (
        <div className="rounded-md border border-carbon-700 bg-carbon-900 p-4 text-titanium-light">
          <h3 className="font-medium text-ice-white">Não comparável</h3>
          <p className="mt-1 text-body-sm">
            Custo landed, componentes e conversões ainda não têm fórmula aprovada. Spread
            indisponível.
          </p>
        </div>
      ) : (
        <form
          onSubmit={run}
          className="flex flex-wrap items-end gap-3 rounded-md border border-carbon-800 bg-carbon-900 p-4"
        >
          <label className="grid gap-1 text-body-sm text-titanium-light">
            Ativo
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="rounded bg-carbon-950 px-3 py-2 text-ice-white"
            >
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {kind === "correlacao" && (
            <>
              <label className="grid gap-1 text-body-sm text-titanium-light">
                Comparar com
                <select
                  value={second}
                  onChange={(e) => setSecond(e.target.value)}
                  className="rounded bg-carbon-950 px-3 py-2 text-ice-white"
                >
                  {assets.map((a) => (
                    <option key={a.symbol} value={a.symbol}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-body-sm text-titanium-light">
                Defasagem
                <select
                  value={lag}
                  onChange={(e) => setLag(e.target.value)}
                  className="rounded bg-carbon-950 px-3 py-2 text-ice-white"
                >
                  {[0, 1, 5, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} dias úteis
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="grid gap-1 text-body-sm text-titanium-light">
            De
            <input
              type="date"
              required
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded bg-carbon-950 px-3 py-2 text-ice-white"
            />
          </label>
          <label className="grid gap-1 text-body-sm text-titanium-light">
            Até
            <input
              type="date"
              required
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded bg-carbon-950 px-3 py-2 text-ice-white"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !symbol}
            className="rounded bg-carmine-core px-4 py-2 text-body-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Calculando…" : "Analisar"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-carmine-light">
          {error}
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <div className="text-body-sm text-titanium-light">
            {data.series
              .map((s) => `${s.name} · ${s.source} · ${s.currency}/${s.unit}`)
              .join(" × ")}{" "}
            · {data.coverage.frequency} · UTC · conversões: nenhuma ·{" "}
            {data.coverage.from.slice(0, 10)} a {data.coverage.to.slice(0, 10)} · método{" "}
            {data.result.methodVersion} · {data.coverage.left}
            {data.coverage.right !== null ? ` / ${data.coverage.right}` : ""} pontos
          </div>
          {data.result.months ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-carbon-700 text-titanium-muted">
                    <th className="p-2">Mês</th>
                    <th className="p-2">Ciclos</th>
                    <th className="p-2">Média</th>
                    <th className="p-2">Dispersão</th>
                  </tr>
                </thead>
                <tbody>
                  {data.result.months.map((m) => (
                    <tr key={m.month} className="border-b border-carbon-800">
                      <td className="p-2 text-ice-white">{MONTHS[m.month - 1]}</td>
                      <td className="p-2">{m.count} / 3</td>
                      <td className="p-2">
                        {m.eligible ? m.mean?.toFixed(2) : "Amostra insuficiente"}
                      </td>
                      <td className="p-2">{m.eligible ? m.dispersion?.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md bg-carbon-900 p-4 text-body-sm text-titanium-light">
              Correlação de Pearson:{" "}
              <strong className="text-ice-white">
                {data.result.coefficient?.toFixed(3) ?? "Amostra insuficiente"}
              </strong>{" "}
              · {data.result.count} pares alinhados · defasagem {data.result.lagBusinessDays} dias
              úteis · IC 95%{" "}
              {data.result.confidence95
                ? data.result.confidence95.map((n) => n.toFixed(3)).join(" a ")
                : "indisponível"}
            </div>
          )}
          <p className="break-all font-mono text-label-code text-titanium-muted">
            SHA-256 da entrada: {data.sourceSnapshotHash}
          </p>
          <div className="flex flex-wrap gap-3 text-body-sm">
            {data.series.flatMap((series, index) =>
              (["csv", "xlsx"] as const).map((format) => {
                const params = new URLSearchParams(exportWindow);
                params.set("symbol", series.symbol);
                params.set("format", format);
                params.set("to", series.exportTo);
                return (
                  <a
                    key={`${index}-${series.symbol}-${format}`}
                    className="text-carmine-light underline hover:text-white"
                    href={`/api/market/history/export?${params}`}
                  >
                    Exportar {format.toUpperCase()} · {series.symbol}
                  </a>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
