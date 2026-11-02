import { describe, it, expect } from "vitest";
import { calculateDio, remnantValueBrl, variationPct } from "./kpis";

describe("KPIs de estoque", () => {
  it("valor do retalho = peso em kg × custo de reposição em R$/kg, para qualquer unidade de estoque", () => {
    expect(remnantValueBrl(500, 6)).toBe(3000);
    expect(remnantValueBrl(1435.5, 5.42)).toBeCloseTo(7780.41, 2);
    expect(remnantValueBrl(0, 6)).toBe(0);
  });

  it("calcula variação percentual e devolve null sem base de comparação", () => {
    expect(variationPct(118, 100)).toBe(18);
    expect(variationPct(50, 100)).toBe(-50);
    expect(variationPct(10, 0)).toBeNull();
  });

  it("calcula DIO = valor em estoque / consumo diário e devolve null sem consumo", () => {
    // consumo de 9.000 em 90 dias = 100/dia; estoque 4.100 -> 41 dias
    expect(calculateDio(4100, 9000)).toBe(41);
    expect(calculateDio(4100, 0)).toBeNull();
    expect(calculateDio(0, 9000)).toBeNull();
  });
});
