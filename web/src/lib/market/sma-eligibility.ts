export interface SmaObservation {
  timestamp: Date;
  close: number;
  source: string;
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
      (row.source !== previous.source ||
        row.timestamp.getTime() - previous.timestamp.getTime() > 4 * 86_400_000 ||
        row.timestamp.getTime() <= previous.timestamp.getTime())
    )
      current.length = 0;
    current.push(row);
  }
  return current.length >= 51 ? current.map((row) => row.close) : [];
}
