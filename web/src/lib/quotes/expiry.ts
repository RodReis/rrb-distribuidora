/**
 * Expiração automática de propostas (débito OR4).
 *
 * Só expiram sozinhas as propostas que estão abertas para o cliente: `enviado` e `em_negociacao`.
 * Ficam de fora: `rascunho` e `bloqueado_margem` (nunca saíram), `aprovado` (o cliente já aceitou)
 * e os terminais `perdido` e `expirado`.
 */
export const AUTO_EXPIRE_STATUSES = ["enviado", "em_negociacao"] as const;

export function isAutoExpirable(
  status: string,
  validUntil: Date | string,
  now: Date = new Date()
): boolean {
  if (!(AUTO_EXPIRE_STATUSES as readonly string[]).includes(status)) return false;
  const until = validUntil instanceof Date ? validUntil : new Date(validUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() < now.getTime();
}
