import { getDefaultDensity } from "@/lib/metallurgy/weight";

export interface RemnantInput {
  family?: string;
  norm?: string;
  densityGCm3?: number | null;
  thicknessMm: number;
  widthMm?: number | null;
  lengthMm?: number | null;
  diameterMm?: number | null;
}

export interface DimensionalSearchCriteria {
  thicknessMm: number;
  thicknessToleranceMm?: number; // default +/- 0.2 mm
  minWidthMm?: number;
  minLengthMm?: number;
  minDiameterMm?: number;
  family?: string;
  norm?: string;
  productId?: string;
}

export interface RemnantMatchResult {
  remnant: any;
  fits: boolean;
  isRotated: boolean;
  wasteAreaMm2: number;
  wastePercentage: number;
  mechanicalEfficiencyPct: number;
  salvagedWeightKg: number;
}

/**
 * Calculates theoretical weight of an offcut/remnant in kg
 */
export function calculateRemnantWeight(input: RemnantInput): number {
  const density =
    input.densityGCm3 && input.densityGCm3 > 0
      ? input.densityGCm3
      : getDefaultDensity(input.family || "chapa_grossa", input.norm);

  // 1. Round bar or pipe offcut
  if (input.diameterMm && input.diameterMm > 0) {
    const d = input.diameterMm;
    const l = (input.lengthMm || 1000) / 1000; // default 1 meter in meters
    const areaMm2 = (Math.PI * Math.pow(d, 2)) / 4;
    const weightKg = ((areaMm2 * density) / 1000) * l;
    return Number(weightKg.toFixed(3));
  }

  // 2. Plate or Coil Offcut (thickness x width x length)
  const t = input.thicknessMm || 0;
  const w = (input.widthMm || 0) / 1000; // in meters
  const l = (input.lengthMm || 0) / 1000; // in meters

  const weightKg = t * w * l * density;
  return Number(weightKg.toFixed(3));
}

/**
 * Checks if a remnant satisfies dimensional requirements and calculates scrap waste
 */
export function evaluateRemnantFit(
  remnant: {
    thicknessMm: number;
    widthMm?: number | null;
    lengthMm?: number | null;
    diameterMm?: number | null;
    weightKg: number;
  },
  criteria: DimensionalSearchCriteria
): RemnantMatchResult | null {
  const tolerance = criteria.thicknessToleranceMm ?? 0.25;

  // Check thickness tolerance
  if (Math.abs(remnant.thicknessMm - criteria.thicknessMm) > tolerance) {
    return null;
  }

  // Bar / Pipe check
  if (criteria.minDiameterMm && criteria.minDiameterMm > 0) {
    const remD = remnant.diameterMm || 0;
    const remL = remnant.lengthMm || 0;
    const minL = criteria.minLengthMm || 0;

    if (remD >= criteria.minDiameterMm && remL >= minL) {
      const wasteL = remL - minL;
      const wastePct = remL > 0 ? (wasteL / remL) * 100 : 0;
      return {
        remnant,
        fits: true,
        isRotated: false,
        wasteAreaMm2: 0,
        wastePercentage: Number(wastePct.toFixed(1)),
        mechanicalEfficiencyPct: Number((100 - wastePct).toFixed(1)),
        salvagedWeightKg: Number(remnant.weightKg),
      };
    }
    return null;
  }

  // Plate check (2D geometry)
  const remW = remnant.widthMm || 0;
  const remL = remnant.lengthMm || 0;
  const reqW = criteria.minWidthMm || 0;
  const reqL = criteria.minLengthMm || 0;

  if (reqW <= 0 || reqL <= 0) {
    return null;
  }

  const directFit = remW >= reqW && remL >= reqL;
  const rotatedFit = remL >= reqW && remW >= reqL;

  if (!directFit && !rotatedFit) {
    return null;
  }

  const isRotated = !directFit && rotatedFit;
  const reqArea = reqW * reqL;
  const remArea = remW * remL;
  const wasteArea = Math.max(0, remArea - reqArea);
  const wastePct = remArea > 0 ? (wasteArea / remArea) * 100 : 0;
  const efficiency = Math.max(0, 100 - wastePct);

  return {
    remnant,
    fits: true,
    isRotated,
    wasteAreaMm2: wasteArea,
    wastePercentage: Number(wastePct.toFixed(1)),
    mechanicalEfficiencyPct: Number(efficiency.toFixed(1)),
    salvagedWeightKg: Number(remnant.weightKg),
  };
}

/**
 * Filters and sorts candidates by lowest residual waste (menor desperdício residual)
 */
export function findMatchingRemnants(
  availableRemnants: any[],
  criteria: DimensionalSearchCriteria
): RemnantMatchResult[] {
  const matches: RemnantMatchResult[] = [];

  for (const rem of availableRemnants) {
    const parsedRem = {
      ...rem,
      thicknessMm: Number(rem.thicknessMm),
      widthMm: rem.widthMm ? Number(rem.widthMm) : null,
      lengthMm: rem.lengthMm ? Number(rem.lengthMm) : null,
      diameterMm: rem.diameterMm ? Number(rem.diameterMm) : null,
      weightKg: Number(rem.weightKg),
    };

    const fit = evaluateRemnantFit(parsedRem, criteria);
    if (fit) {
      matches.push(fit);
    }
  }

  // Sort by lowest waste percentage (highest mechanical efficiency)
  matches.sort((a, b) => a.wastePercentage - b.wastePercentage);

  return matches;
}

/**
 * Calculates economic savings for US-04 (Matching Remnants vs Order)
 */
export function calculateRemnantMatchingSavings(params: {
  virginSheetDimensions: {
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    densityGCm3?: number;
  };
  replacementCostPerKg: number;
  selectedRemnants: {
    weightKg: number;
    salvagedValueEstimated?: number;
  }[];
}): {
  virginSheetWeightKg: number;
  virginSheetCostBrl: number;
  remnantsTotalWeightKg: number;
  costPreservedBrl: number;
  savingsPercentage: number;
} {
  const density = params.virginSheetDimensions.densityGCm3 || 7.85;
  const t = params.virginSheetDimensions.thicknessMm;
  const w = params.virginSheetDimensions.widthMm / 1000;
  const l = params.virginSheetDimensions.lengthMm / 1000;

  const virginWeight = t * w * l * density;
  const virginCost = virginWeight * params.replacementCostPerKg;

  const remnantsWeight = params.selectedRemnants.reduce(
    (sum, r) => sum + Number(r.weightKg || 0),
    0
  );

  // Direct savings = cost of virgin sheet that was saved from being cut down
  // Preserved stock cost:
  const costPreserved = Math.max(
    0,
    virginCost - remnantsWeight * (params.replacementCostPerKg * 0.4)
  );
  const savingsPct = virginCost > 0 ? (costPreserved / virginCost) * 100 : 0;

  return {
    virginSheetWeightKg: Number(virginWeight.toFixed(2)),
    virginSheetCostBrl: Number(virginCost.toFixed(2)),
    remnantsTotalWeightKg: Number(remnantsWeight.toFixed(2)),
    costPreservedBrl: Number(costPreserved.toFixed(2)),
    savingsPercentage: Number(savingsPct.toFixed(1)),
  };
}
