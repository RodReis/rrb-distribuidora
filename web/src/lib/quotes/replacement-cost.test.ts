import { describe, expect, it } from "vitest";
import { normalizeReplacementCostPerKg } from "./replacement-cost";

describe("normalizeReplacementCostPerKg", () => {
  it("mantém o valor quando o catálogo já está em R$/kg", () => {
    expect(
      normalizeReplacementCostPerKg({
        replacementCostBase: "5.3600",
        unit: "kg",
        weightPerUnit: 1435.5,
      })
    ).toBeCloseTo(5.36, 4);
  });

  it("converte preço por tonelada para quilo", () => {
    expect(
      normalizeReplacementCostPerKg({
        replacementCostBase: "5420.0000",
        unit: "t",
        weightPerUnit: 1.4355,
      })
    ).toBeCloseTo(5.42, 4);
  });

  it("converte preço por unidade usando o peso da peça", () => {
    expect(
      normalizeReplacementCostPerKg({
        replacementCostBase: "380.0000",
        unit: "un",
        weightPerUnit: "14.6400",
      })
    ).toBeCloseTo(25.9563, 4);
  });

  it("trata unidade de venda `m` como preço por quilo já cadastrado", () => {
    expect(
      normalizeReplacementCostPerKg({
        replacementCostBase: "24.9000",
        unit: "m",
        weightPerUnit: "14.6400",
      })
    ).toBeCloseTo(24.9, 4);
  });

  it("devolve zero quando o preço-base ou o peso da unidade são inválidos", () => {
    expect(normalizeReplacementCostPerKg({ replacementCostBase: null, unit: "kg" })).toBe(0);
    expect(
      normalizeReplacementCostPerKg({ replacementCostBase: "100", unit: "un", weightPerUnit: 0 })
    ).toBe(0);
  });
});
