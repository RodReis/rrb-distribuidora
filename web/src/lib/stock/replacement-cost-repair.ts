/**
 * Reparo de `replacement_cost_base` gravado por unidade em vez de R$/kg.
 *
 * Antes da correção, a entrada de compra e a importação de saldos gravavam o custo do lote
 * (por t, por un...) nesse campo, que é R$/kg. Esta heurística só propõe conversão quando o
 * valor é implausível como R$/kg E a unidade é uma das que gravavam por unidade (t, un).
 * Nada é alterado sem confirmação humana: o script roda em dry-run por padrão.
 */
import { unitCostToCostPerKg, type UnitProduct } from "./units";

/** Acima disso, R$/kg é implausível para aço, inox ou alumínio. É um sinal, não uma regra de negócio. */
export const SUSPICIOUS_COST_PER_KG_BRL = 150;

export interface RepairCandidate extends UnitProduct {
  id: string;
  sku: string;
  replacementCostBase: string | number;
}

export type RepairProposal =
  | { kind: "fix"; id: string; sku: string; from: number; to: number; reason: string }
  | { kind: "review"; id: string; sku: string; from: number; reason: string };

export function proposeRepair(p: RepairCandidate): RepairProposal | null {
  const from = Number(p.replacementCostBase);
  if (!Number.isFinite(from) || from <= SUSPICIOUS_COST_PER_KG_BRL) return null;

  const unit = (p.unit ?? "").toLowerCase();
  if (unit === "t" || unit === "un") {
    const to = unitCostToCostPerKg(from, p);
    if (to === null) {
      return {
        kind: "review",
        id: p.id,
        sku: p.sku,
        from,
        reason: `valor alto (R$ ${from}) com unidade ${unit}, mas sem peso por peça para converter`,
      };
    }
    return {
      kind: "fix",
      id: p.id,
      sku: p.sku,
      from,
      to,
      reason: `R$ ${from} por ${unit} → R$/kg`,
    };
  }

  return {
    kind: "review",
    id: p.id,
    sku: p.sku,
    from,
    reason: `valor alto (R$ ${from}/kg) com unidade ${unit || "?"}: confira se não é preço por tonelada ou por peça`,
  };
}
