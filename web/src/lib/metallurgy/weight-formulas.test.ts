import { describe, expect, it } from "vitest";
import {
  calculateGeometry,
  calculateProcessCost,
  estimateCutTimeMinutes,
  inferDensityFromNorm,
  KERF_MM,
} from "./weight-formulas";

describe("calculateGeometry — chapa retangular", () => {
  it("confere o peso teórico da chapa A36 12,70 x 2400 x 6000 mm", () => {
    const result = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: 12.7,
      widthMm: 2400,
      lengthMm: 6000,
      densityGCm3: 7.85,
      kerfMm: KERF_MM.laser,
    });

    // Tabela de usina: 1.435,608 kg
    expect(result.netWeightPerPieceKg).toBeCloseTo(1435.608, 2);
    expect(result.netWeightKg).toBeCloseTo(1435.608, 2);
    expect(result.grossWeightKg).toBeGreaterThan(result.netWeightKg);
    expect(result.scrapPct).toBeGreaterThan(0);
    expect(result.scrapPct).toBeLessThan(0.2);
  });

  it("escala linearmente com a quantidade", () => {
    const one = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: 6,
      widthMm: 1200,
      lengthMm: 2400,
      densityGCm3: 7.85,
    });
    const three = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: 6,
      widthMm: 1200,
      lengthMm: 2400,
      densityGCm3: 7.85,
      quantity: 3,
    });

    expect(three.netWeightKg).toBeCloseTo(one.netWeightKg * 3, 2);
    expect(three.netWeightPerPieceKg).toBeCloseTo(one.netWeightPerPieceKg, 4);
  });
});

describe("calculateGeometry — disco / flange", () => {
  it("confere o peso do disco Ø420 mm com furo Ø150 mm e 15,87 mm", () => {
    const result = calculateGeometry({
      geometryType: "DISCO",
      diameterMm: 420,
      innerDiameterMm: 150,
      thicknessMm: 15.87,
      densityGCm3: 7.85,
      kerfMm: KERF_MM.plasma,
    });

    // Área anular 120.873,90 mm² × 15,87 mm × 7,85 g/cm³
    expect(result.netWeightPerPieceKg).toBeCloseTo(15.06, 1);
    expect(result.scrapWeightKg).toBeGreaterThan(0);
    expect(result.cutPathMmPerPiece).toBeCloseTo(Math.PI * 420 + Math.PI * 150, 1);
  });

  it("rejeita furo maior que o diâmetro externo", () => {
    expect(() =>
      calculateGeometry({
        geometryType: "DISCO",
        diameterMm: 200,
        innerDiameterMm: 250,
        thicknessMm: 10,
      })
    ).toThrow(/diâmetro interno/i);
  });
});

describe("calculateGeometry — barra redonda", () => {
  it("confere o peso por metro da barra Ø50,8 mm em aço carbono", () => {
    const result = calculateGeometry({
      geometryType: "BARRA_CORTE",
      diameterMm: 50.8,
      lengthMm: 1000,
      densityGCm3: 7.85,
      kerfMm: KERF_MM.serra,
    });

    // 0,006165 × 50,8² = 15,91 kg/m
    expect(result.netWeightPerPieceKg).toBeCloseTo(15.91, 1);
    expect(result.grossWeightPerPieceKg).toBeGreaterThan(result.netWeightPerPieceKg);
  });
});

describe("calculateGeometry — tubo redondo", () => {
  it("confere o peso por metro do tubo Ø120 x parede 20 mm", () => {
    const result = calculateGeometry({
      geometryType: "TUBO_CORTE",
      diameterMm: 120,
      wallMm: 20,
      lengthMm: 1000,
      densityGCm3: 7.85,
      kerfMm: KERF_MM.serra,
    });

    // Fórmula de catálogo: (120 - 20) × 20 × 0,02466 = 49,32 kg/m
    expect(result.netWeightPerPieceKg).toBeCloseTo(49.32, 1);
  });

  it("rejeita parede maior que o raio", () => {
    expect(() =>
      calculateGeometry({
        geometryType: "TUBO_CORTE",
        diameterMm: 50,
        wallMm: 30,
        lengthMm: 1000,
      })
    ).toThrow(/parede/i);
  });
});

describe("densidades automáticas por liga", () => {
  it("aplica 7,90 g/cm³ ao inox 304", () => {
    expect(inferDensityFromNorm("ASTM A240 Inox 304")).toBe(7.9);
  });

  it("aplica 2,70 g/cm³ ao alumínio 5052", () => {
    expect(inferDensityFromNorm("Alumínio 5052 H32")).toBe(2.7);
  });

  it("usa 7,85 g/cm³ como padrão de aço carbono", () => {
    expect(inferDensityFromNorm("ASTM A36")).toBe(7.85);
    expect(inferDensityFromNorm(null)).toBe(7.85);
  });

  it("chapa 1 m² × 1 mm em inox pesa 7,90 kg", () => {
    const result = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: 1,
      widthMm: 1000,
      lengthMm: 1000,
      densityGCm3: inferDensityFromNorm("Inox 304"),
    });
    expect(result.netWeightPerPieceKg).toBeCloseTo(7.9, 4);
  });

  it("chapa 1 m² × 1 mm em alumínio 5052 pesa 2,70 kg", () => {
    const result = calculateGeometry({
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: 1,
      widthMm: 1000,
      lengthMm: 1000,
      densityGCm3: inferDensityFromNorm("Alumínio 5052"),
    });
    expect(result.netWeightPerPieceKg).toBeCloseTo(2.7, 4);
  });
});

describe("PADRAO e validações", () => {
  it("usa o peso tabelado para produto padrão", () => {
    const result = calculateGeometry({
      geometryType: "PADRAO",
      weightPerUnitKg: 12.5,
      quantity: 4,
    });
    expect(result.netWeightKg).toBe(50);
    expect(result.grossWeightKg).toBe(50);
    expect(result.scrapPct).toBe(0);
  });

  it("exige dimensões obrigatórias", () => {
    expect(() => calculateGeometry({ geometryType: "CHAPA_RETANGULAR", thicknessMm: 10 })).toThrow(
      /largura|comprimento/i
    );
    expect(() => calculateGeometry({ geometryType: "BARRA_CORTE", diameterMm: 50 })).toThrow(
      /comprimento/i
    );
  });
});

describe("tempo e custo de processo", () => {
  it("soma setup ao tempo de corte", () => {
    const time = estimateCutTimeMinutes({
      process: "laser",
      cutPathTotalMm: 16800,
      quantity: 1,
      thicknessMm: 12.7,
      setupMinutes: 15,
    });

    expect(time.setupMinutes).toBe(15);
    expect(time.cutMinutes).toBeGreaterThan(0);
    expect(time.totalMinutes).toBeCloseTo(time.setupMinutes + time.cutMinutes, 2);
  });

  it("custo hora é proporcional ao tempo", () => {
    expect(calculateProcessCost(60, 450)).toBe(450);
    expect(calculateProcessCost(30, 450)).toBe(225);
    expect(calculateProcessCost(0, 450)).toBe(0);
  });

  it("kerfs oficiais por processo", () => {
    expect(KERF_MM).toEqual({
      laser: 1.5,
      plasma: 3,
      oxicorte: 5,
      serra: 4,
      guilhotina: 0,
      dobra: 0,
    });
  });
});
