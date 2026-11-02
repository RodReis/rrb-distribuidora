/**
 * Cálculo puro do delta de mercado usado na precificação por reposição.
 *
 * Separado do acesso a banco para permitir teste unitário determinístico.
 */

export interface MarketBar {
  /** Unix seconds. */
  time: number;
  close: number;
}

const DAY_SECONDS = 86_400;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Mapeia o produto para o índice de mercado mais representativo.
 *
 * - Alumínio (5052/6061/6063) usa LME-ALU.
 * - Aços carbono/inox usam o HRC como proxy de reposição, porque o MVP-01
 *   não possui índice específico de inox.
 */
export function marketSymbolForProduct(norm?: string | null, family?: string | null): string {
  const text = `${norm ?? ""} ${family ?? ""}`.toUpperCase();

  if (
    text.includes("ALU") ||
    text.includes("ALUM") ||
    text.includes("5052") ||
    text.includes("6061") ||
    text.includes("6063")
  ) {
    return "LME-ALU";
  }

  return "CME-HRC";
}

/**
 * Variação percentual entre o primeiro preço disponível a partir de `since`
 * e o último preço da série. Retorna `null` quando não há base de comparação.
 */
export function computeDeltaSince(bars: MarketBar[], since: Date): number | null {
  if (!bars.length) return null;

  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const sinceSeconds = Math.floor(since.getTime() / 1000);
  const base = ordered.find((bar) => bar.time >= sinceSeconds) ?? ordered[0];
  const last = ordered[ordered.length - 1];

  if (!base || !last || base.close <= 0) return null;

  return round(((last.close - base.close) / base.close) * 100, 4);
}

/**
 * Volatilidade semanal: variação percentual entre o fechamento atual e o
 * fechamento mais próximo de 7 dias atrás. Sem base, assume mercado calmo.
 */
export function computeWeeklyVolatility(bars: MarketBar[]): number {
  if (bars.length < 2) return 0;

  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const last = ordered[ordered.length - 1];
  const targetSeconds = last.time - 7 * DAY_SECONDS;

  let base = ordered[0];
  for (const bar of ordered) {
    if (bar.time <= targetSeconds) base = bar;
    else break;
  }

  if (!base || base.close <= 0) return 0;

  return round(Math.abs(((last.close - base.close) / base.close) * 100), 2);
}

export interface MarketMovement {
  last: number | null;
  change7dPct: number;
  volatilityPct: number;
  asOf: string | null;
}

export function summarizeMarketMovement(bars: MarketBar[]): MarketMovement {
  if (!bars.length) {
    return { last: null, change7dPct: 0, volatilityPct: 0, asOf: null };
  }

  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const last = ordered[ordered.length - 1];
  const targetSeconds = last.time - 7 * DAY_SECONDS;

  let base = ordered[0];
  for (const bar of ordered) {
    if (bar.time <= targetSeconds) base = bar;
    else break;
  }

  const change7dPct =
    base && base.close > 0 ? round(((last.close - base.close) / base.close) * 100, 4) : 0;

  return {
    last: round(last.close, 4),
    change7dPct,
    volatilityPct: round(Math.abs(change7dPct), 2),
    asOf: new Date(last.time * 1000).toISOString(),
  };
}

/** Trava de segurança para deltas extremos de mercado (±20%). */
export function clampMarketDelta(deltaPct: number): number {
  if (!Number.isFinite(deltaPct)) return 0;
  return round(Math.max(-20, Math.min(20, deltaPct)), 4);
}
