export interface SmaObservation {
  timestamp: Date;
  close: number;
  source: string;
}

function consecutiveSession(previous: Date, current: Date): boolean {
  const elapsed = current.getTime() - previous.getTime();
  return elapsed === 86_400_000 || (previous.getUTCDay() === 5 && elapsed === 3 * 86_400_000);
}

/** Última sequência de sessões observadas; troca de fonte/lacuna invalida janela anterior. */
export function eligibleSmaCloses(rows: SmaObservation[]): number[] {
  const ordered = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const current: SmaObservation[] = [];
  for (const row of ordered) {
    const previous = current[current.length - 1];
    if (!Number.isFinite(row.close) || row.close <= 0) {
      current.length = 0;
      continue;
    }
    if (
      previous &&
      (row.source !== previous.source || !consecutiveSession(previous.timestamp, row.timestamp))
    )
      current.length = 0;
    current.push(row);
  }
  return current.length >= 51 ? current.map((row) => row.close) : [];
}
