import { snapshotHash } from "./analysis";

export type SignalModelDraft = {
  version: string;
  components: string[];
  weights: Record<string, number>;
  thresholds: { low: number; high: number };
  horizonDays: number;
  minimumCoverage: number;
  methodology: Record<string, unknown>;
};

export function validateSignalModel(model: SignalModelDraft): string[] {
  const errors: string[] = [];
  if (!model.version.trim()) errors.push("Versão obrigatória.");
  if (!model.components.length || new Set(model.components).size !== model.components.length)
    errors.push("Componentes obrigatórios e únicos.");
  if (Object.keys(model.weights).sort().join("|") !== [...model.components].sort().join("|"))
    errors.push("Pesos devem corresponder aos componentes.");
  if (
    Object.values(model.weights).some((weight) => !Number.isFinite(weight) || weight < 0) ||
    Math.abs(Object.values(model.weights).reduce((sum, weight) => sum + weight, 0) - 1) > 1e-9
  )
    errors.push("Pesos devem ser não negativos e somar 1.");
  if (
    !Number.isFinite(model.thresholds.low) ||
    !Number.isFinite(model.thresholds.high) ||
    model.thresholds.low < 0 ||
    model.thresholds.high > 100 ||
    model.thresholds.low >= model.thresholds.high
  )
    errors.push("Limites devem estar ordenados entre 0 e 100.");
  if (!Number.isInteger(model.horizonDays) || model.horizonDays <= 0)
    errors.push("Horizonte deve ser positivo.");
  if (
    !Number.isFinite(model.minimumCoverage) ||
    model.minimumCoverage <= 0 ||
    model.minimumCoverage > 1
  )
    errors.push("Cobertura deve estar entre 0 e 1.");
  return errors;
}

export type TimestampedInput = { availableAt: string; value: number };

export function inputsAsOf(inputs: TimestampedInput[], asOf: string): TimestampedInput[] {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error("Data de decisão inválida.");
  return inputs.filter((input) => {
    const availableAt = Date.parse(input.availableAt);
    if (!Number.isFinite(availableAt)) throw new Error("Data de disponibilidade inválida.");
    return availableAt <= cutoff;
  });
}

export function decisionSnapshotHash(
  modelVersion: string,
  asOf: string,
  inputs: Record<string, TimestampedInput[]>
): string {
  return snapshotHash({
    modelVersion,
    asOf,
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([component, points]) => [component, inputsAsOf(points, asOf)])
    ),
  });
}

export const SIGNAL_DISABLED_REASON =
  "Modelo sem componentes, pesos, métricas e protocolo de aprovação definidos pelo PI.";
