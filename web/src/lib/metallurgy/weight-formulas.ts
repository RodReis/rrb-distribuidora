/**
 * Fórmulas metalúrgicas determinísticas — MVP-03.
 *
 * Nenhum LLM participa do cálculo. Todas as massas são obtidas por volume
 * geométrico (mm³ → cm³) multiplicado pela densidade da liga (g/cm³).
 *
 * Referências de conferência:
 * - Chapa A36 12,70 x 2400 x 6000 mm → 1.435,608 kg
 * - Barra redonda Ø50,8 mm → 15,91 kg/m (aço carbono)
 * - Tubo Ø120 x parede 20 mm → 49,32 kg/m (aço carbono)
 */

export const GEOMETRY_TYPES = [
  "CHAPA_RETANGULAR",
  "DISCO",
  "BARRA_CORTE",
  "TUBO_CORTE",
  "PADRAO",
] as const;

export type GeometryType = (typeof GEOMETRY_TYPES)[number];

export const CUT_PROCESSES = [
  "laser",
  "plasma",
  "oxicorte",
  "serra",
  "guilhotina",
  "dobra",
] as const;

export type CutProcess = (typeof CUT_PROCESSES)[number];

/** Kerf de corte por processo, em milímetros. */
export const KERF_MM: Record<CutProcess, number> = {
  laser: 1.5,
  plasma: 3,
  oxicorte: 5,
  serra: 4,
  guilhotina: 0,
  dobra: 0,
};

export const DENSITY_BY_ALLOY = {
  aco_carbono: 7.85,
  inox_304: 7.9,
  aluminio_5052: 2.7,
} as const;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Densidade automática conforme a liga/norma descrita no produto.
 * A ordem importa: inox e alumínio são verificados antes do fallback de aço.
 */
export function inferDensityFromNorm(norm?: string | null, family?: string | null): number {
  const text = `${norm ?? ""} ${family ?? ""}`.toUpperCase();

  if (
    text.includes("INOX") ||
    text.includes("STAINLESS") ||
    text.includes("304") ||
    text.includes("316") ||
    text.includes("AISI 4")
  ) {
    return DENSITY_BY_ALLOY.inox_304;
  }

  if (
    text.includes("ALU") ||
    text.includes("ALUM") ||
    text.includes("5052") ||
    text.includes("6061") ||
    text.includes("6063")
  ) {
    return DENSITY_BY_ALLOY.aluminio_5052;
  }

  return DENSITY_BY_ALLOY.aco_carbono;
}

export const ALLOY_OPTIONS = [
  { value: "aco_carbono", label: "Aço Carbono (7,85 g/cm³)", density: 7.85 },
  { value: "inox_304", label: "Inox 304/316 (7,90 g/cm³)", density: 7.9 },
  { value: "aluminio_5052", label: "Alumínio 5052 (2,70 g/cm³)", density: 2.7 },
] as const;

export type AlloyKey = (typeof ALLOY_OPTIONS)[number]["value"];

export interface GeometryInput {
  geometryType: GeometryType;
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthMm?: number | null;
  diameterMm?: number | null;
  innerDiameterMm?: number | null;
  wallMm?: number | null;
  densityGCm3?: number | null;
  quantity?: number | null;
  kerfMm?: number | null;
  /** Usado apenas para peças PADRAO (peso tabelado). */
  weightPerUnitKg?: number | null;
}

export interface GeometryResult {
  geometryType: GeometryType;
  quantity: number;
  densityGCm3: number;
  kerfMm: number;
  volumePerPieceCm3: number;
  netWeightPerPieceKg: number;
  grossWeightPerPieceKg: number;
  netWeightKg: number;
  grossWeightKg: number;
  scrapWeightKg: number;
  scrapPct: number;
  cutPathMmPerPiece: number;
  cutPathTotalMm: number;
  /** Dimensões externas normalizadas para exibição/PDF. */
  dimensionsLabel: string;
}

function assertPositive(value: number | null | undefined, field: string): asserts value is number {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Informe ${field} maior que zero.`);
  }
}

export function dimensionsLabel(input: GeometryInput): string {
  const t = input.thicknessMm ? `${formatMm(input.thicknessMm)} mm` : null;

  switch (input.geometryType) {
    case "CHAPA_RETANGULAR":
      return [
        input.lengthMm ? `${formatMm(input.lengthMm)} × ${formatMm(input.widthMm ?? 0)} mm` : null,
        t,
      ]
        .filter(Boolean)
        .join(" × ");
    case "DISCO":
      return [
        `Ø ${formatMm(input.diameterMm ?? 0)} mm`,
        input.innerDiameterMm ? `furo Ø ${formatMm(input.innerDiameterMm)} mm` : null,
        t,
      ]
        .filter(Boolean)
        .join(" × ");
    case "BARRA_CORTE":
      return `Ø ${formatMm(input.diameterMm ?? 0)} mm × ${formatMm(
        input.lengthMm ?? 0
      )} mm de corte`;
    case "TUBO_CORTE":
      return `Ø ${formatMm(input.diameterMm ?? 0)} mm × parede ${formatMm(
        input.wallMm ?? 0
      )} mm × ${formatMm(input.lengthMm ?? 0)} mm`;
    case "PADRAO":
      return "Produto padrão de catálogo";
    default:
      return "—";
  }
}

function formatMm(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Calcula peso líquido, peso bruto (com kerf) e sucata de uma peça cortada.
 * O peso bruto é o volume do blanque consumido por peça, já incluindo o kerf
 * do processo selecionado — não é uma estimativa de nesting compartilhado.
 */
export function calculateGeometry(input: GeometryInput): GeometryResult {
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));
  const density = input.densityGCm3 && input.densityGCm3 > 0 ? input.densityGCm3 : 7.85;
  const kerf = Math.max(0, input.kerfMm ?? 0);

  let volumeNetMm3 = 0;
  let volumeGrossMm3 = 0;
  let cutPathMm = 0;

  switch (input.geometryType) {
    case "CHAPA_RETANGULAR": {
      assertPositive(input.thicknessMm, "a espessura");
      assertPositive(input.widthMm, "a largura");
      assertPositive(input.lengthMm, "o comprimento");
      const t = input.thicknessMm;
      const w = input.widthMm;
      const l = input.lengthMm;
      volumeNetMm3 = l * w * t;
      volumeGrossMm3 = (l + kerf) * (w + kerf) * t;
      cutPathMm = 2 * (l + w);
      break;
    }

    case "DISCO": {
      assertPositive(input.thicknessMm, "a espessura");
      assertPositive(input.diameterMm, "o diâmetro externo");
      const t = input.thicknessMm;
      const od = input.diameterMm;
      const id = Math.max(0, input.innerDiameterMm ?? 0);
      if (id >= od) throw new Error("O diâmetro interno deve ser menor que o externo.");
      volumeNetMm3 = (Math.PI / 4) * (od ** 2 - id ** 2) * t;
      // Blanque externo consumido: disco do diâmetro externo + kerf.
      volumeGrossMm3 = (Math.PI / 4) * (od + kerf) ** 2 * t;
      cutPathMm = Math.PI * od + (id > 0 ? Math.PI * id : 0);
      break;
    }

    case "BARRA_CORTE": {
      assertPositive(input.diameterMm, "o diâmetro");
      assertPositive(input.lengthMm, "o comprimento de corte");
      const d = input.diameterMm;
      const l = input.lengthMm;
      volumeNetMm3 = (Math.PI / 4) * d ** 2 * l;
      volumeGrossMm3 = (Math.PI / 4) * d ** 2 * (l + kerf);
      cutPathMm = Math.PI * d;
      break;
    }

    case "TUBO_CORTE": {
      assertPositive(input.diameterMm, "o diâmetro externo");
      assertPositive(input.wallMm, "a espessura da parede");
      assertPositive(input.lengthMm, "o comprimento de corte");
      const od = input.diameterMm;
      const wall = input.wallMm;
      const id = od - 2 * wall;
      if (id <= 0) throw new Error("A parede informada é maior que o raio do tubo.");
      volumeNetMm3 = (Math.PI / 4) * (od ** 2 - id ** 2) * input.lengthMm;
      volumeGrossMm3 = (Math.PI / 4) * (od ** 2 - id ** 2) * (input.lengthMm + kerf);
      cutPathMm = Math.PI * od;
      break;
    }

    case "PADRAO": {
      const unit = input.weightPerUnitKg;
      assertPositive(unit, "o peso tabelado por unidade");
      volumeNetMm3 = 0;
      volumeGrossMm3 = 0;
      cutPathMm = 0;
      const netPerPiece = unit as number;
      const grossPerPiece = netPerPiece;
      return {
        geometryType: input.geometryType,
        quantity,
        densityGCm3: round(density, 4),
        kerfMm: kerf,
        volumePerPieceCm3: 0,
        netWeightPerPieceKg: round(netPerPiece, 4),
        grossWeightPerPieceKg: round(grossPerPiece, 4),
        netWeightKg: round(netPerPiece * quantity, 4),
        grossWeightKg: round(grossPerPiece * quantity, 4),
        scrapWeightKg: 0,
        scrapPct: 0,
        cutPathMmPerPiece: 0,
        cutPathTotalMm: 0,
        dimensionsLabel: dimensionsLabel(input),
      };
    }

    default:
      throw new Error("Geometria de corte não suportada.");
  }

  const volumePerPieceCm3 = volumeNetMm3 / 1000;
  const netWeightPerPieceKg = (volumeNetMm3 / 1000) * (density / 1000);
  const grossWeightPerPieceKg = (volumeGrossMm3 / 1000) * (density / 1000);
  const netWeightKg = netWeightPerPieceKg * quantity;
  const grossWeightKg = grossWeightPerPieceKg * quantity;
  const scrapWeightKg = Math.max(0, grossWeightKg - netWeightKg);
  const scrapPct = grossWeightKg > 0 ? (scrapWeightKg / grossWeightKg) * 100 : 0;

  return {
    geometryType: input.geometryType,
    quantity,
    densityGCm3: round(density, 4),
    kerfMm: kerf,
    volumePerPieceCm3: round(volumePerPieceCm3, 4),
    netWeightPerPieceKg: round(netWeightPerPieceKg, 4),
    grossWeightPerPieceKg: round(grossWeightPerPieceKg, 4),
    netWeightKg: round(netWeightKg, 4),
    grossWeightKg: round(grossWeightKg, 4),
    scrapWeightKg: round(scrapWeightKg, 4),
    scrapPct: round(scrapPct, 2),
    cutPathMmPerPiece: round(cutPathMm, 2),
    cutPathTotalMm: round(cutPathMm * quantity, 2),
    dimensionsLabel: dimensionsLabel(input),
  };
}

/** Tempo de corte estimado, em minutos, para o lote de peças. */
export interface CutTimeInput {
  process: CutProcess;
  cutPathTotalMm: number;
  quantity: number;
  thicknessMm?: number | null;
  setupMinutes?: number | null;
}

/**
 * Velocidades nominais de referência (mm/min) para operação em regime.
 * A espessura reduz a velocidade de processos térmicos conforme a tabela
 * de corte da máquina; serra/guilhotina usam o caminho de corte como golpe.
 */
const BASE_CUT_SPEED_MM_MIN: Record<CutProcess, number> = {
  laser: 2400,
  plasma: 1500,
  oxicorte: 500,
  serra: 150,
  guilhotina: 5000,
  dobra: 1200,
};

export function estimateCutTimeMinutes(input: CutTimeInput): {
  setupMinutes: number;
  cutMinutes: number;
  totalMinutes: number;
  speedMmMin: number;
} {
  const setupMinutes = Math.max(0, input.setupMinutes ?? 0);
  const thickness = Math.max(0, input.thicknessMm ?? 0);
  const thermal =
    input.process === "laser" || input.process === "plasma" || input.process === "oxicorte";

  // Espessuras maiores reduzem a velocidade; piso de 12% da velocidade nominal.
  const thicknessFactor = thermal ? Math.max(0.12, 1 / (1 + Math.max(0, thickness - 6) / 6)) : 1;
  const speedMmMin = BASE_CUT_SPEED_MM_MIN[input.process] * thicknessFactor;

  const effectivePath =
    input.process === "serra" || input.process === "guilhotina"
      ? Math.max(1, input.quantity) * (input.cutPathTotalMm / Math.max(1, input.quantity) + 4)
      : input.cutPathTotalMm;

  const cutMinutes = speedMmMin > 0 ? effectivePath / speedMmMin : 0;
  const totalMinutes = setupMinutes + cutMinutes;

  return {
    setupMinutes: round(setupMinutes, 2),
    cutMinutes: round(cutMinutes, 2),
    totalMinutes: round(totalMinutes, 2),
    speedMmMin: round(speedMmMin, 2),
  };
}

/** Custo de processo em R$ para um tempo total em minutos. */
export function calculateProcessCost(totalMinutes: number, costPerHour: number): number {
  const minutes = Math.max(0, totalMinutes);
  const hourCost = Math.max(0, costPerHour);
  return round((minutes / 60) * hourCost, 4);
}

/** Compatibilidade com a nomenclatura usada pela spec (cut-calculator). */
export function calculateCutCost(params: { totalMinutes: number; costPerHour: number }): number {
  return calculateProcessCost(params.totalMinutes, params.costPerHour);
}
