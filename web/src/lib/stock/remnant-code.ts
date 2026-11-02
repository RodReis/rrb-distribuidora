/** Código sequencial de retalho: RET-00001, RET-00002... (a coluna `code` é única). */
export function formatRemnantCode(sequence: number): string {
  return `RET-${String(Math.max(1, Math.trunc(sequence))).padStart(5, "0")}`;
}

/** Erro de violação de unicidade do Postgres (código 23505), direto ou embrulhado pelo driver. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
