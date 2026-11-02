import { describe, expect, it } from "vitest";
import { convertToBrlPerKg } from "./converter";
import { calculateParity, classifySpread, type ParityInput } from "./parity-calculator";
import { pctChange, sma, smaCross } from "./indicators";

const base: ParityInput = {
  fobUsdPerTon: 510,
  oceanFreightUsdPerTon: 58,
  insuranceUsdPerTon: 0,
  ptax: 5.482,
  iiPct: 12,
  ipiPct: 3.25,
  pisPct: 2.1,
  cofinsPct: 9.65,
  icmsPct: 18,
  portExpensesBrlPerTon: 150,
  roadFreightBrlPerTon: 280,
  domesticPriceBrlPerTon: 4710,
  volumeTons: 300,
  recoverTaxes: true,
};

describe("converter", () => {
  it("converte US$/t para R$/kg", () => {
    expect(convertToBrlPerKg(2000, "USD/t", 5)).toBeCloseTo(10, 6);
  });
  it("converte USD/lb e USD/cwt", () => {
    expect(convertToBrlPerKg(1, "USD/lb", 5)).toBeCloseTo(11.0231, 3);
    expect(convertToBrlPerKg(100, "USD/cwt", 5)).toBeCloseTo(11.0231, 3);
  });
});

describe("parity calculator", () => {
  it("calcula a cascata tributária linha a linha", () => {
    const r = calculateParity(base);
    expect(r.cifBrl).toBe(3113.78);
    expect(r.iiBrl).toBe(373.65);
    expect(r.ipiBrl).toBe(113.34);
    expect(r.pisBrl).toBe(65.39);
    expect(r.cofinsBrl).toBe(300.48);
    expect(r.icmsBaseBrl).toBe(5020.29);
    expect(r.icmsBrl).toBe(903.65);
    expect(r.recoverableBrl).toBe(1382.86);
    expect(r.grossLandedBrlPerTon).toBe(5300.29);
    expect(r.landedBrlPerTon).toBe(3917.43);
  });

  it("calcula spread, economia e sinal", () => {
    const r = calculateParity(base);
    expect(r.spreadPct).toBeCloseTo(16.82, 1);
    expect(r.savingBrlPerTon).toBe(792.57);
    expect(r.savingTotalBrl).toBe(237771);
    expect(r.signal).toBe("buy_import");
  });

  it("não recupera tributos quando desligado", () => {
    const r = calculateParity({ ...base, recoverTaxes: false });
    expect(r.landedBrlPerTon).toBe(r.grossLandedBrlPerTon);
    expect(r.signal).toBe("buy_domestic");
  });

  it("classifica nos limites 5% e 12%", () => {
    expect(classifySpread(12.01)).toBe("buy_import");
    expect(classifySpread(12)).toBe("hold");
    expect(classifySpread(5)).toBe("hold");
    expect(classifySpread(4.99)).toBe("buy_domestic");
  });

  it("não divide por zero sem preço de usina", () => {
    expect(calculateParity({ ...base, domesticPriceBrlPerTon: 0 }).spreadPct).toBe(0);
  });
});

describe("indicators", () => {
  it("calcula SMA", () => {
    const pts = [1, 2, 3, 4, 5].map((v, i) => ({ time: i, value: v }));
    expect(sma(pts, 3).map((p) => p.value)).toEqual([2, 3, 4]);
  });
  it("detecta cruzamento dourado", () => {
    const closes = [...Array(60).fill(100), ...Array(10).fill(200)];
    expect(smaCross(closes.slice(0, 60), 20, 50)).toBeNull();
    expect(smaCross(closes.slice(0, 61), 20, 50)).toBe("golden");
    expect(smaCross(closes.slice(0, 62), 20, 50)).toBeNull();
  });
  it("calcula variação percentual", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(1, 0)).toBe(0);
  });
});
