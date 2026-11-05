import { SIGNAL_DISABLED_REASON } from "@/lib/market/signals";

export function MarketSignals() {
  return (
    <section
      className="rounded border border-carbon-700 bg-carbon-900 p-6"
      aria-labelledby="signals-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-label-code uppercase tracking-widest text-titanium-muted">
            LAC-07 · Sinal composto
          </p>
          <h2 id="signals-title" className="mt-2 text-xl font-semibold text-ice-white">
            Sinal indisponível
          </h2>
        </div>
        <span className="rounded border border-signal-hold/40 bg-signal-hold/10 px-3 py-1 font-mono text-label-code text-signal-hold">
          AGUARDANDO REGRA
        </span>
      </div>
      <p className="mt-4 max-w-2xl text-body-sm text-titanium-light">{SIGNAL_DISABLED_REASON}</p>
      <p className="mt-3 max-w-2xl text-body-sm text-titanium-muted">
        Score, confiança e backtest só aparecem após aprovação do modelo e registro das entradas.
        Resultados servem de apoio à decisão.
      </p>
    </section>
  );
}
