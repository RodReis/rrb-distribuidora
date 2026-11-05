import { describe, expect, it } from "vitest";
import { eligibleSmaCloses } from "./sma-eligibility";

const sequence = (count: number, source = "FEED") =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, index + 1)),
    close: index + 1,
    source,
  }));

describe("elegibilidade de média de mercado", () => {
  it("exige 51 observações consecutivas da mesma fonte", () => {
    expect(eligibleSmaCloses(sequence(50))).toEqual([]);
    expect(eligibleSmaCloses(sequence(51))).toHaveLength(51);
    const mixed = sequence(51);
    mixed[30].source = "OTHER";
    expect(eligibleSmaCloses(mixed)).toEqual([]);
  });

  it("lacuna acima de quatro dias interrompe janela", () => {
    const rows = sequence(51);
    rows[30].timestamp = new Date(Date.UTC(2026, 2, 1));
    expect(eligibleSmaCloses(rows)).toEqual([]);
  });
});
