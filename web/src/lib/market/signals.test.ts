import { describe, expect, it } from "vitest";
import { decisionSnapshotHash, inputsAsOf, validateSignalModel } from "./signals";

const draft = {
  version: "v1",
  components: ["a", "b"],
  weights: { a: 0.6, b: 0.4 },
  thresholds: { low: 30, high: 70 },
  horizonDays: 20,
  minimumCoverage: 0.8,
  methodology: {},
};

describe("estrutura de sinais LAC-07", () => {
  it("rejeita pesos ausentes ou soma inválida", () => {
    expect(validateSignalModel(draft)).toEqual([]);
    expect(validateSignalModel({ ...draft, weights: { a: 1 } })).not.toEqual([]);
    expect(validateSignalModel({ ...draft, weights: { a: 0.2, b: 0.2 } })).not.toEqual([]);
  });

  it("não inclui informação conhecida após a decisão no snapshot histórico", () => {
    const original = { a: [{ availableAt: "2026-01-01T12:00:00Z", value: 10 }] };
    const future = { a: [...original.a, { availableAt: "2026-01-02T00:00:00Z", value: 99 }] };
    expect(inputsAsOf(future.a, "2026-01-01T18:00:00Z")).toEqual(original.a);
    expect(decisionSnapshotHash("v1", "2026-01-01T18:00:00Z", original)).toBe(
      decisionSnapshotHash("v1", "2026-01-01T18:00:00Z", future)
    );
  });
});
