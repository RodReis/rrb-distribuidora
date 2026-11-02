import { describe, expect, it } from "vitest";
import { SUSPICIOUS_COST_PER_KG_BRL, proposeRepair } from "./replacement-cost-repair";

const base = { id: "p1", sku: "X-1", family: "chapa_grossa" };

describe("proposeRepair", () => {
  it("não mexe em valor plausível como R$/kg", () => {
    expect(proposeRepair({ ...base, unit: "kg", replacementCostBase: "5.36" })).toBeNull();
    expect(proposeRepair({ ...base, unit: "t", replacementCostBase: "5.42" })).toBeNull();
    expect(
      proposeRepair({ ...base, unit: "un", replacementCostBase: SUSPICIOUS_COST_PER_KG_BRL })
    ).toBeNull();
  });

  it("converte preço por tonelada para R$/kg", () => {
    expect(proposeRepair({ ...base, unit: "t", replacementCostBase: "5420.0000" })).toMatchObject({
      kind: "fix",
      from: 5420,
      to: 5.42,
    });
  });

  it("converte preço por peça usando o peso da peça", () => {
    const r = proposeRepair({
      ...base,
      family: "tubo",
      unit: "un",
      weightPerUnit: "14.6400",
      replacementCostBase: "380.0000",
    });
    expect(r).toMatchObject({ kind: "fix", from: 380 });
    expect(r?.kind === "fix" && r.to).toBeCloseTo(25.9563, 4);
  });

  it("peça sem peso cadastrado vai para revisão, não é convertida às cegas", () => {
    expect(
      proposeRepair({ ...base, unit: "un", weightPerUnit: 0, replacementCostBase: "380" })
    ).toMatchObject({ kind: "review", from: 380 });
  });

  it("valor alto em kg ou m só é sinalizado para revisão", () => {
    expect(proposeRepair({ ...base, unit: "kg", replacementCostBase: "900" })).toMatchObject({
      kind: "review",
    });
    expect(proposeRepair({ ...base, unit: "m", replacementCostBase: "900" })).toMatchObject({
      kind: "review",
    });
  });

  it("valor inválido é ignorado", () => {
    expect(proposeRepair({ ...base, unit: "t", replacementCostBase: "abc" })).toBeNull();
  });
});
