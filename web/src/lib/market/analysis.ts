import { createHash } from "node:crypto";

export interface AnalysisPoint {
  day: string;
  close: number;
}

function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function snapshotHash(input: unknown): string {
  return createHash("sha256").update(stable(input)).digest("hex");
}

export function seasonality(points: AnalysisPoint[], minimumCycles: number) {
  const byMonth = Array.from({ length: 12 }, () => new Map<number, number[]>());
  for (const point of points) {
    const date = new Date(`${point.day}T00:00:00Z`);
    if (!Number.isFinite(point.close) || Number.isNaN(date.getTime())) continue;
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    const values = byMonth[month].get(year) ?? [];
    values.push(point.close);
    byMonth[month].set(year, values);
  }
  return {
    methodVersion: "monthly-calendar-v1",
    minimumCycles,
    months: byMonth.map((years, index) => {
      const values = [...years.values()].map(
        (samples) => samples.reduce((a, b) => a + b, 0) / samples.length
      );
      const count = values.length;
      const eligible = count >= minimumCycles;
      const mean = eligible ? values.reduce((a, b) => a + b, 0) / count : null;
      const dispersion =
        mean === null
          ? null
          : Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count);
      return { month: index + 1, count, eligible, mean, dispersion };
    }),
  };
}

function businessDayAfter(day: string, lag: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  for (let i = 0; i < lag;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) i++;
  }
  return date.toISOString().slice(0, 10);
}

function isBusinessDay(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function shiftedBusinessDate(date: Date, lag: number): Date {
  if (lag === 0) return new Date(date);
  return new Date(`${businessDayAfter(date.toISOString().slice(0, 10), lag)}T23:59:59.999Z`);
}

export function correlation(left: AnalysisPoint[], right: AnalysisPoint[], lag: number) {
  if (![0, 1, 5, 20].includes(lag)) throw new Error("Defasagem não aprovada.");
  const rightByDay = new Map(
    right
      .filter((p) => Number.isFinite(p.close) && isBusinessDay(p.day))
      .map((p) => [p.day, p.close])
  );
  const pairs = left
    .filter((p) => Number.isFinite(p.close) && isBusinessDay(p.day))
    .flatMap((p) => {
      const other = rightByDay.get(businessDayAfter(p.day, lag));
      return other === undefined ? [] : [[p.close, other]];
    });
  const count = pairs.length;
  const avgLeft = pairs.reduce((sum, pair) => sum + pair[0], 0) / count;
  const avgRight = pairs.reduce((sum, pair) => sum + pair[1], 0) / count;
  const covariance = pairs.reduce(
    (sum, pair) => sum + (pair[0] - avgLeft) * (pair[1] - avgRight),
    0
  );
  const varianceLeft = pairs.reduce((sum, pair) => sum + (pair[0] - avgLeft) ** 2, 0);
  const varianceRight = pairs.reduce((sum, pair) => sum + (pair[1] - avgRight) ** 2, 0);
  const coefficient =
    count >= 3 && varianceLeft > 0 && varianceRight > 0
      ? covariance / Math.sqrt(varianceLeft * varianceRight)
      : null;
  const z =
    coefficient !== null && count > 3 && Math.abs(coefficient) < 1 ? Math.atanh(coefficient) : null;
  const margin = count > 3 ? 1.96 / Math.sqrt(count - 3) : null;
  return {
    methodVersion: "pearson-fisher-v1",
    lagBusinessDays: lag,
    count,
    coefficient,
    confidence95:
      z !== null && margin !== null ? [Math.tanh(z - margin), Math.tanh(z + margin)] : null,
  };
}
