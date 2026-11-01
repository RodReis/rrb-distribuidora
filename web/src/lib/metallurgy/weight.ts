/**
 * Metallurgical theoretical weight calculation library.
 * Density defaults:
 * - Carbon Steel / Low Alloy: 7.85 g/cm3 (7850 kg/m3)
 * - Stainless Steel (AISI 304/316): 7.93 g/cm3 (7930 kg/m3)
 * - Aluminum (5052/6061): 2.68 - 2.70 g/cm3 (2700 kg/m3)
 */

export interface DimensionsInput {
  family: "chapa_grossa" | "bobina" | "tubo" | "perfil" | "barra";
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthMm?: number | null;
  diameterMm?: number | null;
  wallMm?: number | null;
  densityGCm3?: number | null; // e.g. 7.85
  unit?: "kg" | "m" | "un" | "t";
}

export function getDefaultDensity(family: string, norm?: string): number {
  const normUpper = (norm || "").toUpperCase();
  if (normUpper.includes("INOX") || normUpper.includes("304") || normUpper.includes("316")) {
    return 7.93;
  }
  if (normUpper.includes("ALU") || normUpper.includes("5052") || normUpper.includes("6061")) {
    return 2.68;
  }
  return 7.85; // Default carbon steel
}

/**
 * Calculates theoretical weight per unit based on standard metallurgical formulas.
 * Result returned in kg per base unit (e.g., per piece/plate or per linear meter).
 */
export function calculateTheoreticalWeight(input: DimensionsInput): {
  weightPerUnit: number; // in kg
  weightPerMeter?: number; // for bars / tubes / profiles
  weightPerSquareMeter?: number; // for plates
} {
  const density = input.densityGCm3 && input.densityGCm3 > 0 ? input.densityGCm3 : 7.85;

  switch (input.family) {
    case "chapa_grossa": {
      const t = input.thicknessMm || 0; // mm
      const w = (input.widthMm || 0) / 1000; // meters
      const l = (input.lengthMm || 0) / 1000; // meters
      // kg/m2 = thickness(mm) * density
      const weightPerSquareMeter = t * density;
      const weightPerUnit = weightPerSquareMeter * w * l;
      return {
        weightPerUnit: Number(weightPerUnit.toFixed(4)),
        weightPerSquareMeter: Number(weightPerSquareMeter.toFixed(4)),
      };
    }

    case "bobina": {
      const t = input.thicknessMm || 0; // mm
      const w = (input.widthMm || 0) / 1000; // meters
      // For coils, standard weight is usually per linear meter or total coil
      // kg/linear meter = thickness(mm) * width(m) * density
      const weightPerMeter = t * w * density;
      return {
        weightPerUnit: Number(weightPerMeter.toFixed(4)),
        weightPerMeter: Number(weightPerMeter.toFixed(4)),
      };
    }

    case "tubo": {
      const od = input.diameterMm || 0; // Outer Diameter in mm
      const wall = input.wallMm || 0; // Wall thickness in mm
      const l = (input.lengthMm || 6000) / 1000; // default 6 meters if not specified
      // Standard pipe formula: (OD - wall) * wall * 0.02466 * (density / 7.85) in kg/m
      const factor = (density / 7.85) * 0.0246615;
      const weightPerMeter = (od - wall) * wall * factor;
      const weightPerUnit = weightPerMeter * l;
      return {
        weightPerUnit: Number(weightPerUnit.toFixed(4)),
        weightPerMeter: Number(weightPerMeter.toFixed(4)),
      };
    }

    case "barra": {
      const d = input.diameterMm || 0; // mm
      const l = (input.lengthMm || 6000) / 1000; // meters
      // Round bar: Area = pi * (d/2)^2 = pi * d^2 / 4 in mm2
      // kg/m = Area(mm2) * density * 1e-3 = 0.006165 * d^2 (for 7.85)
      const areaMm2 = (Math.PI * Math.pow(d, 2)) / 4;
      const weightPerMeter = (areaMm2 * density) / 1000;
      const weightPerUnit = weightPerMeter * l;
      return {
        weightPerUnit: Number(weightPerUnit.toFixed(4)),
        weightPerMeter: Number(weightPerMeter.toFixed(4)),
      };
    }

    case "perfil": {
      // For profiles (W-beam, etc.), usually nominal weight is standard (e.g. W200x31.3 -> 31.3 kg/m)
      // If linear weight is approximated or provided, we calculate per total bar length (usually 12m)
      const l = (input.lengthMm || 12000) / 1000;
      // Default fallback if thickness/width/length provided
      const t = input.thicknessMm || 0;
      const w = (input.widthMm || 0) / 1000;
      const weightPerMeter = t > 0 && w > 0 ? t * w * density : 31.3;
      return {
        weightPerUnit: Number((weightPerMeter * l).toFixed(4)),
        weightPerMeter: Number(weightPerMeter.toFixed(4)),
      };
    }

    default:
      return { weightPerUnit: 1 };
  }
}
