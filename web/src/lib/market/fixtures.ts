import { ASSET_SYMBOLS } from "./assets";

export interface FixtureBar {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ANCHORS: Record<string, { start: number; drift: number; vol: number }> = {
  [ASSET_SYMBOLS.LME_ALU]: { start: 2350, drift: 0.0004, vol: 0.011 },
  [ASSET_SYMBOLS.HRC_US]: { start: 760, drift: -0.0003, vol: 0.009 },
  [ASSET_SYMBOLS.HRC_CN]: { start: 510, drift: 0.0001, vol: 0.008 },
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Série sintética determinística para desenvolvimento (não representa preço real de mercado). */
export function generateFixtureBars(symbol: string, endDay: Date, months = 24): FixtureBar[] {
  const anchor = ANCHORS[symbol];
  if (!anchor) return [];
  const rand = mulberry32(hash(symbol));
  const start = new Date(endDay);
  start.setUTCMonth(start.getUTCMonth() - months);

  const bars: FixtureBar[] = [];
  let prev = anchor.start;
  for (let d = new Date(start); d <= endDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const open = prev;
    const close = open * (1 + anchor.drift + (rand() - 0.5) * 2 * anchor.vol);
    const high = Math.max(open, close) * (1 + rand() * anchor.vol * 0.5);
    const low = Math.min(open, close) * (1 - rand() * anchor.vol * 0.5);
    bars.push({
      day: d.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: Math.round(40000 + rand() * 120000),
    });
    prev = close;
  }
  return bars;
}
