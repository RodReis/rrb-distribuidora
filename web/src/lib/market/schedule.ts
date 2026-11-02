export const MARKET_TIMEZONE = "America/Sao_Paulo";

export const DEFAULT_METALS_CRON = "0 19 * * 1-5";
export const PTAX_CRONS = ["15 13 * * 1-5", "0 18 * * 1-5"] as const;

/** Recálculo diário do estoque preventivo (M2), todos os dias às 04h00. */
export const STOCK_PREDICTIVE_CRON = "0 4 * * *";

/** Expressão cron (5 campos) dos metais; configurável por METALS_CRON. */
export function getMetalsCron(): string {
  const value = process.env.METALS_CRON?.trim();
  return value ? value : DEFAULT_METALS_CRON;
}
