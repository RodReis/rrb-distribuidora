import { z } from "zod";

const pct = z.number().min(0).max(100);
const money = z.number().min(0).max(10_000_000);

export const parityInputSchema = z.object({
  fobUsdPerTon: money,
  oceanFreightUsdPerTon: money,
  insuranceUsdPerTon: money.default(0),
  ptax: z.number().positive().max(100),
  iiPct: pct,
  ipiPct: pct,
  pisPct: pct,
  cofinsPct: pct,
  icmsPct: z.number().min(0).max(99),
  portExpensesBrlPerTon: money,
  roadFreightBrlPerTon: money,
  domesticPriceBrlPerTon: money,
  volumeTons: z.number().min(0).max(1_000_000),
  recoverTaxes: z.boolean().default(true),
});

export const parityConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe um nome.").max(100),
  associatedProductId: z.string().uuid().nullable().optional(),
  iiTaxPct: pct,
  ipiTaxPct: pct,
  pisTaxPct: pct,
  cofinsTaxPct: pct,
  icmsTaxPct: z.number().min(0).max(99),
  portExpensesPerTon: money,
  roadFreightPerTon: money,
  oceanFreightUsdPerTon: money,
  domesticPriceBrlPerTon: money,
});
