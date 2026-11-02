import { describe, expect, it } from "vitest";
import {
  clampMarketDelta,
  computeDeltaSince,
  computeWeeklyVolatility,
  marketSymbolForProduct,
  summarizeMarketMovement,
} from "./market-delta";

const day = 86_400;
const base = Math.floor(new Date("2026-10-01T00:00:00.000Z").getTime() / 1000);

describe("marketSymbolForProduct", () => {
  it("usa LME-ALU para alumínio", () => {
    expect(marketSymbolForProduct("Alumínio 5052 H32")).toBe("LME-ALU");
    expect(marketSymbolForProduct("AA 6061-T6")).toBe("LME-ALU");
  });

  it("usa CME-HRC para aço carbono e inox", () => {
    expect(marketSymbolForProduct("ASTM A36")).toBe("CME-HRC");
    expect(marketSymbolForProduct("AISI 304")).toBe("CME-HRC");
    expect(marketSymbolForProduct(null)).toBe("CME-HRC");
  });
});

describe("computeDeltaSince", () => {
  it("compara o primeiro preço após a data com o último", () => {
    const bars = [
      { time: base, close: 100 },
      { time: base + 10 * day, close: 105 },
      { time: base + 20 * day, close: 110 },
    ];
    expect(computeDeltaSince(bars, new Date((base + 10 * day) * 1000))).toBeCloseTo(4.7619, 3);
  });

  it("usa a série inteira quando a data é anterior ao início", () => {
    const bars = [
      { time: base, close: 100 },
      { time: base + 10 * day, close: 90 },
    ];
    expect(computeDeltaSince(bars, new Date((base - 5 * day) * 1000))).toBeCloseTo(-10, 4);
  });

  it("retorna null sem série", () => {
    expect(computeDeltaSince([], new Date())).toBeNull();
  });
});

describe("computeWeeklyVolatility", () => {
  it("mede a variação dos últimos 7 dias", () => {
    const bars = [
      { time: base, close: 100 },
      { time: base + 7 * day, close: 104 },
      { time: base + 8 * day, close: 106 },
    ];
    expect(computeWeeklyVolatility(bars)).toBeCloseTo(6, 2);
  });

  it("assume zero sem base suficiente", () => {
    expect(computeWeeklyVolatility([])).toBe(0);
    expect(computeWeeklyVolatility([{ time: base, close: 100 }])).toBe(0);
  });
});

describe("summarizeMarketMovement", () => {
  it("expõe último preço, variação 7d e volatilidade absoluta", () => {
    const bars = [
      { time: base, close: 100 },
      { time: base + 7 * day, close: 96 },
      { time: base + 8 * day, close: 95 },
    ];
    const movement = summarizeMarketMovement(bars);

    expect(movement.last).toBe(95);
    expect(movement.change7dPct).toBeCloseTo(-5, 4);
    expect(movement.volatilityPct).toBeCloseTo(5, 2);
    expect(movement.asOf).toContain("2026-10-09");
  });

  it("sem barras retorna valores neutros", () => {
    expect(summarizeMarketMovement([])).toEqual({
      last: null,
      change7dPct: 0,
      volatilityPct: 0,
      asOf: null,
    });
  });
});

describe("clampMarketDelta", () => {
  it("limita a variação aplicada a ±20%", () => {
    expect(clampMarketDelta(35)).toBe(20);
    expect(clampMarketDelta(-42)).toBe(-20);
    expect(clampMarketDelta(7.123456)).toBeCloseTo(7.1235, 4);
  });

  it("neutraliza valores não finitos", () => {
    expect(clampMarketDelta(Number.NaN)).toBe(0);
    expect(clampMarketDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
