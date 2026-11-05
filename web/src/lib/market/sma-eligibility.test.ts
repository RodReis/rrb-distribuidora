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

  it("qualquer dia ausente interrompe janela", () => {
    const rows = sequence(51);
    rows.splice(30, 1);
    rows.push({ timestamp: new Date(Date.UTC(2026, 1, 21)), close: 52, source: "FEED" });
    expect(eligibleSmaCloses(rows)).toEqual([]);
  });

  it("sexta para segunda mantém sessões úteis consecutivas", () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 0, 2 + index + 2 * Math.floor((index + 4) / 5))),
      close: index + 1,
      source: "FEED",
    }));
    expect(eligibleSmaCloses(rows)).toHaveLength(51);
  });
});
