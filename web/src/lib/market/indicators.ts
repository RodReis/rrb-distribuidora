export interface PricePoint {
  time: number;
  value: number;
}

export function sma(points: PricePoint[], period: number): PricePoint[] {
  const out: PricePoint[] = [];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].value;
    if (i >= period) sum -= points[i - period].value;
    if (i >= period - 1) out.push({ time: points[i].time, value: sum / period });
  }
  return out;
}

export function smaCross(closes: number[], fast = 20, slow = 50): "golden" | "death" | null {
  if (closes.length < slow + 1) return null;
  const avg = (end: number, period: number) => {
    let s = 0;
    for (let i = end - period; i < end; i++) s += closes[i];
    return s / period;
  };
  const n = closes.length;
  const prevDiff = avg(n - 1, fast) - avg(n - 1, slow);
  const currDiff = avg(n, fast) - avg(n, slow);
  if (prevDiff <= 0 && currDiff > 0) return "golden";
  if (prevDiff >= 0 && currDiff < 0) return "death";
  return null;
}

export function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}
