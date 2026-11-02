import type { ParityInput } from "./parity-calculator";

export const PARITY_DEFAULTS: Omit<ParityInput, "fobUsdPerTon" | "ptax"> = {
  oceanFreightUsdPerTon: 58,
  insuranceUsdPerTon: 0,
  iiPct: 12,
  ipiPct: 3.25,
  pisPct: 2.1,
  cofinsPct: 9.65,
  icmsPct: 18,
  portExpensesBrlPerTon: 150,
  roadFreightBrlPerTon: 280,
  domesticPriceBrlPerTon: 4710,
  volumeTons: 300,
  recoverTaxes: true,
};
