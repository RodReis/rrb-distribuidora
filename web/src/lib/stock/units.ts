/**
 * Unidades e custos: a definição canônica.
 *
 * - `products.replacement_cost_base` é SEMPRE R$/kg (spec MVP-00, US-04).
 * - Quantidade e custo dos LOTES e MOVIMENTOS seguem a unidade comercial do produto
 *   (`products.unit`: kg, t, m ou un). É o natural para estoque.
 * - Toda conversão entre os dois mundos passa por aqui. Nenhum outro lugar deve multiplicar
 *   quantidade por `replacement_cost_base`, nem gravar custo de lote nesse campo sem converter.
 */
import { calculateTheoreticalWeight } from "@/lib/metallurgy/weight";

type Num = number | string | null | undefined;

export interface UnitProduct {
  unit: string;
  family: string;
  /** kg por peça/chapa/barra (para `un`) ou por metro linear (bobina). */
  weightPerUnit?: Num;
  thicknessMm?: Num;
  widthMm?: Num;
  lengthMm?: Num;
  diameterMm?: Num;
  wallMm?: Num;
  densityGCm3?: Num;
}

const num = (v: Num): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Quantos kg tem 1 unidade de estoque do produto. `null` quando não dá para saber
 * (ex.: unidade `un` sem peso por peça): quem chama decide o que fazer, nunca assumimos 1.
 */
export function kgPerStockUnit(p: UnitProduct): number | null {
  switch ((p.unit ?? "").toLowerCase()) {
    case "kg":
      return 1;
    case "t":
      return 1000;
    case "un": {
      const w = num(p.weightPerUnit);
      return w !== null && w > 0 ? w : null;
    }
    case "m": {
      // Perfil: o peso gravado é da barra inteira (padrão 12 m). Evita o 31,3 kg/m padrão da fórmula.
      if (p.family === "perfil") {
        const w = num(p.weightPerUnit);
        if (w === null || w <= 0) return null;
        const lengthM = (num(p.lengthMm) ?? 12_000) / 1000;
        return lengthM > 0 ? w / lengthM : null;
      }
      const calc = calculateTheoreticalWeight({
        family: p.family as "chapa_grossa" | "bobina" | "tubo" | "perfil" | "barra",
        thicknessMm: num(p.thicknessMm),
        widthMm: num(p.widthMm),
        lengthMm: num(p.lengthMm),
        diameterMm: num(p.diameterMm),
        wallMm: num(p.wallMm),
        densityGCm3: num(p.densityGCm3),
      });
      const perMeter = calc.weightPerMeter;
      return perMeter && perMeter > 0 ? perMeter : null;
    }
    default:
      return null;
  }
}

/** Quantidade em unidade de estoque → kg. */
export function stockQtyToKg(qty: Num, p: UnitProduct): number | null {
  const k = kgPerStockUnit(p);
  const q = num(qty);
  return k === null || q === null ? null : q * k;
}

/** Custo por unidade de estoque (R$/t, R$/m, R$/un...) → R$/kg. */
export function unitCostToCostPerKg(unitCost: Num, p: UnitProduct): number | null {
  const k = kgPerStockUnit(p);
  const c = num(unitCost);
  return k === null || c === null ? null : round4(c / k);
}

/** R$/kg → custo por unidade de estoque. */
export function costPerKgToUnitCost(costPerKg: Num, p: UnitProduct): number | null {
  const k = kgPerStockUnit(p);
  const c = num(costPerKg);
  return k === null || c === null ? null : round4(c * k);
}

/**
 * Valor de uma quantidade (em unidade de estoque) ao custo de reposição R$/kg.
 * `null` quando a conversão para kg é desconhecida: nunca devolve um valor inventado.
 */
export function valueAtCostPerKg(qty: Num, costPerKg: Num, p: UnitProduct): number | null {
  const kg = stockQtyToKg(qty, p);
  const c = num(costPerKg);
  return kg === null || c === null ? null : kg * c;
}

/** `replacement_cost_base` (R$/kg) como número; 0 quando ausente ou inválido. */
export function replacementCostPerKg(base: Num): number {
  const v = num(base);
  return v !== null && v > 0 ? round4(v) : 0;
}
