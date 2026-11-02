export interface ParityInput {
  fobUsdPerTon: number;
  oceanFreightUsdPerTon: number;
  insuranceUsdPerTon: number;
  ptax: number;
  iiPct: number;
  ipiPct: number;
  pisPct: number;
  cofinsPct: number;
  icmsPct: number;
  portExpensesBrlPerTon: number;
  roadFreightBrlPerTon: number;
  domesticPriceBrlPerTon: number;
  volumeTons: number;
  recoverTaxes: boolean;
}

export type ParitySignal = "buy_import" | "hold" | "buy_domestic";

export interface ParityResult {
  fobBrl: number;
  oceanFreightBrl: number;
  insuranceBrl: number;
  cifBrl: number;
  iiBrl: number;
  ipiBrl: number;
  pisBrl: number;
  cofinsBrl: number;
  icmsBaseBrl: number;
  icmsBrl: number;
  portExpensesBrl: number;
  roadFreightBrl: number;
  recoverableBrl: number;
  grossLandedBrlPerTon: number;
  landedBrlPerTon: number;
  landedBrlPerKg: number;
  landedUsdPerTon: number;
  domesticBrlPerKg: number;
  spreadPct: number;
  savingBrlPerTon: number;
  savingTotalBrl: number;
  signal: ParitySignal;
}

export const SPREAD_FAVORABLE_PCT = 12;
export const SPREAD_NEUTRAL_PCT = 5;

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function classifySpread(spreadPct: number): ParitySignal {
  if (spreadPct > SPREAD_FAVORABLE_PCT) return "buy_import";
  if (spreadPct >= SPREAD_NEUTRAL_PCT) return "hold";
  return "buy_domestic";
}

/**
 * Cascata tributária de importação (por tonelada, valores em R$ arredondados em centavos
 * a cada linha, como numa planilha fiscal/DI):
 *  - II = CIF × II%
 *  - IPI = (CIF + II) × IPI%
 *  - PIS/COFINS-importação = CIF × alíquota
 *  - ICMS "por dentro" = base × ICMS%, base = (CIF + II + IPI + PIS + COFINS + despesas portuárias) / (1 − ICMS%)
 * IPI, PIS, COFINS e ICMS são recuperáveis para a distribuidora (revenda) quando `recoverTaxes`.
 */
export function calculateParity(input: ParityInput): ParityResult {
  const fobBrl = cents(input.fobUsdPerTon * input.ptax);
  const oceanFreightBrl = cents(input.oceanFreightUsdPerTon * input.ptax);
  const insuranceBrl = cents(input.insuranceUsdPerTon * input.ptax);
  const cifBrl = cents(fobBrl + oceanFreightBrl + insuranceBrl);

  const iiBrl = cents(cifBrl * (input.iiPct / 100));
  const ipiBrl = cents((cifBrl + iiBrl) * (input.ipiPct / 100));
  const pisBrl = cents(cifBrl * (input.pisPct / 100));
  const cofinsBrl = cents(cifBrl * (input.cofinsPct / 100));

  const portExpensesBrl = cents(input.portExpensesBrlPerTon);
  const roadFreightBrl = cents(input.roadFreightBrlPerTon);

  const icmsRate = Math.min(input.icmsPct, 99.99) / 100;
  const icmsBaseBrl = cents(
    (cifBrl + iiBrl + ipiBrl + pisBrl + cofinsBrl + portExpensesBrl) / (1 - icmsRate)
  );
  const icmsBrl = cents(icmsBaseBrl * icmsRate);

  const recoverableBrl = input.recoverTaxes ? cents(ipiBrl + pisBrl + cofinsBrl + icmsBrl) : 0;

  const grossLandedBrlPerTon = cents(
    cifBrl + iiBrl + ipiBrl + pisBrl + cofinsBrl + icmsBrl + portExpensesBrl + roadFreightBrl
  );
  const landedBrlPerTon = cents(grossLandedBrlPerTon - recoverableBrl);

  const spreadPct =
    input.domesticPriceBrlPerTon > 0
      ? ((input.domesticPriceBrlPerTon - landedBrlPerTon) / input.domesticPriceBrlPerTon) * 100
      : 0;
  const savingBrlPerTon = cents(input.domesticPriceBrlPerTon - landedBrlPerTon);

  return {
    fobBrl,
    oceanFreightBrl,
    insuranceBrl,
    cifBrl,
    iiBrl,
    ipiBrl,
    pisBrl,
    cofinsBrl,
    icmsBaseBrl,
    icmsBrl,
    portExpensesBrl,
    roadFreightBrl,
    recoverableBrl,
    grossLandedBrlPerTon,
    landedBrlPerTon,
    landedBrlPerKg: landedBrlPerTon / 1000,
    landedUsdPerTon: input.ptax > 0 ? landedBrlPerTon / input.ptax : 0,
    domesticBrlPerKg: input.domesticPriceBrlPerTon / 1000,
    spreadPct,
    savingBrlPerTon,
    savingTotalBrl: cents(savingBrlPerTon * input.volumeTons),
    signal: classifySpread(spreadPct),
  };
}
