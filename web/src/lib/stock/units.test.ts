import { describe, expect, it } from "vitest";
import {
  costPerKgToUnitCost,
  kgPerStockUnit,
  replacementCostPerKg,
  stockQtyToKg,
  unitCostToCostPerKg,
  valueAtCostPerKg,
} from "./units";

const sheetKg = { unit: "kg", family: "chapa_grossa", weightPerUnit: 1435.5 };
const sheetT = { unit: "t", family: "chapa_grossa", weightPerUnit: 1.4355 };
const bar = { unit: "un", family: "tubo", weightPerUnit: "14.6400" };
// Tubo inox 2" parede 2,0 mm: (50,8 − 2) × 2 × 0,0246615 × (7,93 / 7,85) ≈ 2,431 kg/m
const tubePerMeter = {
  unit: "m",
  family: "tubo",
  diameterMm: 50.8,
  wallMm: 2,
  lengthMm: 6000,
  densityGCm3: 7.93,
  weightPerUnit: 14.58,
};
const beam = { unit: "m", family: "perfil", weightPerUnit: 375.6, lengthMm: null };

describe("kgPerStockUnit", () => {
  it("kg e t são fixos", () => {
    expect(kgPerStockUnit(sheetKg)).toBe(1);
    expect(kgPerStockUnit(sheetT)).toBe(1000);
  });

  it("un usa o peso da peça", () => {
    expect(kgPerStockUnit(bar)).toBeCloseTo(14.64, 4);
  });

  it("un sem peso é desconhecido (nunca assume 1)", () => {
    expect(kgPerStockUnit({ unit: "un", family: "barra", weightPerUnit: 0 })).toBeNull();
    expect(kgPerStockUnit({ unit: "un", family: "barra", weightPerUnit: null })).toBeNull();
  });

  it("m calcula kg por metro pelas dimensões (tubo)", () => {
    expect(kgPerStockUnit(tubePerMeter)).toBeCloseTo(2.431, 2);
  });

  it("m de perfil usa o peso da barra dividido pelo comprimento (12 m por padrão)", () => {
    expect(kgPerStockUnit(beam)).toBeCloseTo(31.3, 4);
    expect(kgPerStockUnit({ ...beam, lengthMm: 6000, weightPerUnit: 187.8 })).toBeCloseTo(31.3, 4);
  });

  it("unidade desconhecida ou chapa em metro não tem conversão", () => {
    expect(kgPerStockUnit({ unit: "cx", family: "barra" })).toBeNull();
    expect(kgPerStockUnit({ unit: "m", family: "chapa_grossa", thicknessMm: 12.7 })).toBeNull();
  });
});

describe("conversões", () => {
  it("quantidade em unidade de estoque vira kg", () => {
    expect(stockQtyToKg(18.5, sheetT)).toBe(18_500);
    expect(stockQtyToKg("120", bar)).toBeCloseTo(1756.8, 4);
    expect(stockQtyToKg(10, { unit: "un", family: "barra" })).toBeNull();
  });

  it("custo por unidade de estoque vira R$/kg", () => {
    expect(unitCostToCostPerKg(5420, sheetT)).toBeCloseTo(5.42, 4);
    expect(unitCostToCostPerKg(380, bar)).toBeCloseTo(25.9563, 4);
    expect(unitCostToCostPerKg(5.36, sheetKg)).toBeCloseTo(5.36, 4);
    expect(unitCostToCostPerKg(60, { unit: "un", family: "barra" })).toBeNull();
  });

  it("ida e volta R$/kg ↔ custo por unidade", () => {
    const perKg = unitCostToCostPerKg(380, bar)!;
    expect(costPerKgToUnitCost(perKg, bar)).toBeCloseTo(380, 2);
  });

  it("valor ao custo de reposição R$/kg usa o peso real, não a quantidade crua", () => {
    // 18,5 t a R$ 5,42/kg = R$ 100.270 (e não 18,5 × 5,42 = R$ 100)
    expect(valueAtCostPerKg(18.5, 5.42, sheetT)).toBeCloseTo(100_270, 2);
    expect(valueAtCostPerKg(100, 5.36, sheetKg)).toBeCloseTo(536, 2);
    expect(valueAtCostPerKg(120, 25.9563, bar)).toBeCloseTo(45_600, 0);
  });

  it("sem conversão conhecida devolve null em vez de inventar valor", () => {
    expect(valueAtCostPerKg(5, 10, { unit: "un", family: "barra" })).toBeNull();
    expect(valueAtCostPerKg(5, null, sheetKg)).toBeNull();
  });
});

describe("replacementCostPerKg", () => {
  it("lê o campo como R$/kg, sem converter por unidade", () => {
    expect(replacementCostPerKg("5.3600")).toBe(5.36);
    expect(replacementCostPerKg(24.9)).toBe(24.9);
  });

  it("zero quando ausente, inválido ou negativo", () => {
    expect(replacementCostPerKg(null)).toBe(0);
    expect(replacementCostPerKg("")).toBe(0);
    expect(replacementCostPerKg("abc")).toBe(0);
    expect(replacementCostPerKg(-3)).toBe(0);
  });
});
