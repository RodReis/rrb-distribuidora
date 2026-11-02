export const CONDITION_TYPES = [
  "PERCENT_CHANGE_24H",
  "PERCENT_CHANGE_7D",
  "THRESHOLD_ABOVE",
  "THRESHOLD_BELOW",
  "SMA_CROSS",
  "PARITY_SPREAD_ABOVE",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const CONDITION_LABELS: Record<ConditionType, string> = {
  PERCENT_CHANGE_24H: "Variação diária (±%)",
  PERCENT_CHANGE_7D: "Variação semanal (±%)",
  THRESHOLD_ABOVE: "Preço acima de",
  THRESHOLD_BELOW: "Preço abaixo de",
  SMA_CROSS: "Cruzamento SMA 20 × SMA 50",
  PARITY_SPREAD_ABOVE: "Spread de importação acima de (%)",
};
