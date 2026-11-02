import { describe, it, expect } from "vitest";
import {
  calculateRemnantWeight,
  evaluateRemnantFit,
  findMatchingRemnants,
  calculateRemnantMatchingSavings,
} from "./remnants-engine";

describe("Remnants Engine - Theoretical Weight & Dimensional Matching", () => {
  it("calculates theoretical weight for steel plate remnant", () => {
    // 12.7mm thickness x 1250mm width x 2400mm length, density 7.85
    // Volume = 12.7 * 1.25 * 2.4 = 38.1 dm3 -> weight = 38.1 * 7.85 = 299.085 kg
    const weight = calculateRemnantWeight({
      family: "chapa_grossa",
      norm: "ASTM A36",
      thicknessMm: 12.7,
      widthMm: 1250,
      lengthMm: 2400,
      densityGCm3: 7.85,
    });

    expect(weight).toBeCloseTo(299.085, 1);
  });

  it("calculates theoretical weight for stainless steel remnant (density 7.93)", () => {
    // 3mm x 850mm x 1600mm, inox 304 (7.93)
    // 3 * 0.85 * 1.6 * 7.93 = 32.354 kg
    const weight = calculateRemnantWeight({
      family: "chapa_grossa",
      norm: "AISI 304L",
      thicknessMm: 3.0,
      widthMm: 850,
      lengthMm: 1600,
      densityGCm3: 7.93,
    });

    expect(weight).toBeCloseTo(32.354, 1);
  });

  it("evaluates direct and rotated 2D fit accurately", () => {
    const remnant = {
      thicknessMm: 12.7,
      widthMm: 1000,
      lengthMm: 2000,
      weightKg: 199.39,
    };

    // Direct fit: requested 800 x 1500
    const directFit = evaluateRemnantFit(remnant, {
      thicknessMm: 12.7,
      minWidthMm: 800,
      minLengthMm: 1500,
    });
    expect(directFit).not.toBeNull();
    expect(directFit?.fits).toBe(true);
    expect(directFit?.isRotated).toBe(false);

    // Rotated fit: requested 1500 x 800 (width > remnant.width, but fits when rotated!)
    const rotatedFit = evaluateRemnantFit(remnant, {
      thicknessMm: 12.7,
      minWidthMm: 1500,
      minLengthMm: 800,
    });
    expect(rotatedFit).not.toBeNull();
    expect(rotatedFit?.fits).toBe(true);
    expect(rotatedFit?.isRotated).toBe(true);

    // Does not fit: requested 1200 x 2500 (too large)
    const tooLarge = evaluateRemnantFit(remnant, {
      thicknessMm: 12.7,
      minWidthMm: 1200,
      minLengthMm: 2500,
    });
    expect(tooLarge).toBeNull();
  });

  it("sorts matching candidates by lowest residual waste", () => {
    const remnants = [
      {
        id: "RET-1",
        thicknessMm: 6.35,
        widthMm: 2000,
        lengthMm: 3000, // Area: 6,000,000
        weightKg: 300,
      },
      {
        id: "RET-2",
        thicknessMm: 6.35,
        widthMm: 1100,
        lengthMm: 1600, // Area: 1,760,000 (tightest fit!)
        weightKg: 88,
      },
      {
        id: "RET-3",
        thicknessMm: 6.35,
        widthMm: 1400,
        lengthMm: 2000, // Area: 2,800,000
        weightKg: 140,
      },
    ];

    // Requested piece: 1000 x 1500 (Area: 1,500,000)
    const matches = findMatchingRemnants(remnants, {
      thicknessMm: 6.35,
      minWidthMm: 1000,
      minLengthMm: 1500,
    });

    expect(matches.length).toBe(3);
    // Tightest fit RET-2 should be first
    expect(matches[0].remnant.id).toBe("RET-2");
    expect(matches[0].mechanicalEfficiencyPct).toBeGreaterThan(matches[1].mechanicalEfficiencyPct);
    expect(matches[2].remnant.id).toBe("RET-1");
  });

  it("calculates economic savings avoiding cutting a new virgin sheet (US-04)", () => {
    const savings = calculateRemnantMatchingSavings({
      virginSheetDimensions: {
        thicknessMm: 12.7,
        widthMm: 2400,
        lengthMm: 6000,
        densityGCm3: 7.85,
      },
      replacementCostPerKg: 6.2,
      selectedRemnants: [{ weightKg: 298.5 }, { weightKg: 150.0 }],
    });

    expect(savings.virginSheetWeightKg).toBeCloseTo(1435.6, 1);
    expect(savings.virginSheetCostBrl).toBeGreaterThan(8000);
    expect(savings.costPreservedBrl).toBeGreaterThan(0);
    expect(savings.savingsPercentage).toBeGreaterThan(50);
  });
});
