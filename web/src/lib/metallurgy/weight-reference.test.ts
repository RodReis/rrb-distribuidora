/**
 * Peso contra valores de referência normativos, não contra cálculo manual (débito OR6).
 *
 * - Vergalhão CA-50: massa linear nominal da tabela da NBR 7480 (kg/m). É uma tabela oficial,
 *   independente da fórmula usada no sistema (π/4 · d² · densidade).
 * - Chapa de aço carbono: massa por m² = espessura (mm) × 7,85, como nas tabelas de catálogo
 *   de usina (Gerdau/Usiminas). Aqui a referência usa a mesma densidade; o teste garante que a
 *   fórmula de volume e a de área não divergem das tabelas.
 *
 * Critério de aceite do M3: erro < 1% (a US-01 pede < 0,5%; usamos o mais rígido).
 */
import { describe, expect, it } from "vitest";
import { calculateGeometry } from "./weight-formulas";

const TOLERANCE = 0.005; // 0,5%

const within = (actual: number, expected: number) =>
  Math.abs(actual - expected) / expected <= TOLERANCE;

describe("barra redonda x NBR 7480 (CA-50, kg/m)", () => {
  const nominal: [diameterMm: number, kgPerM: number][] = [
    [6.3, 0.245],
    [8.0, 0.395],
    [10.0, 0.617],
    [12.5, 0.963],
    [16.0, 1.578],
    [20.0, 2.466],
    [25.0, 3.853],
    [32.0, 6.313],
    [40.0, 9.865],
  ];

  it.each(nominal)("Ø %s mm = %s kg/m (erro < 0,5%)", (diameterMm, expected) => {
    const r = calculateGeometry({
      geometryType: "BARRA_CORTE",
      diameterMm,
      lengthMm: 1000,
      densityGCm3: 7.85,
      quantity: 1,
      kerfMm: 0,
    });
    expect(within(r.netWeightPerPieceKg, expected)).toBe(true);
  });
});

describe("chapa de aço carbono x tabela de catálogo (kg/m²)", () => {
  const catalog: [thicknessMm: number, kgPerM2: number][] = [
    [6.35, 49.8], // 1/4"
    [9.53, 74.8], // 3/8"
    [12.7, 99.7], // 1/2"
    [19.05, 149.5], // 3/4"
    [25.4, 199.4], // 1"
  ];

  it.each(catalog)("%s mm = %s kg/m² (erro < 0,5%)", (thicknessMm, expected) => {
    const r = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm,
      widthMm: 1000,
      lengthMm: 1000,
      densityGCm3: 7.85,
      quantity: 1,
      kerfMm: 0,
    });
    expect(within(r.netWeightPerPieceKg, expected)).toBe(true);
  });
});
