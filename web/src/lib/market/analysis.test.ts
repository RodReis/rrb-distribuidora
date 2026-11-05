import { describe, expect, it } from "vitest";
import { correlation, seasonality, shiftedBusinessDate, snapshotHash } from "./analysis";

const point = (day: string, close: number) => ({ day, close });

describe("LAC-06 analysis", () => {
  it("requires three observed cycles per calendar month and never fills gaps", () => {
    const rows = [
      point("2023-01-02", 10),
      point("2024-01-02", 20),
      point("2025-01-02", 30),
      point("2023-02-02", 40),
      point("2025-02-02", 60),
    ];
    const result = seasonality(rows, 3);
    expect(result.months[0]).toMatchObject({ count: 3, mean: 20, eligible: true });
    expect(result.months[1]).toMatchObject({ count: 2, eligible: false });
    expect(result.months[1].mean).toBeNull();
  });

  it("aligns a known shifted series by business-day lag without zero filling", () => {
    const left = [
      point("2026-11-02", 1),
      point("2026-11-03", 2),
      point("2026-11-04", 3),
      point("2026-11-05", 4),
    ];
    const right = [
      point("2026-11-03", 1),
      point("2026-11-04", 2),
      point("2026-11-05", 3),
      point("2026-11-06", 4),
    ];
    const result = correlation(left, right, 1);
    expect(result.count).toBe(4);
    expect(result.coefficient).toBe(1);
    expect(correlation(left, right.slice(1), 1).count).toBe(3);
    expect(
      correlation([...left, point("2026-11-07", 99)], [...right, point("2026-11-07", 99)], 0).count
    ).toBe(3);
    expect(
      shiftedBusinessDate(new Date("2026-11-06T23:59:59Z"), 1).toISOString().slice(0, 10)
    ).toBe("2026-11-09");
  });

  it("hashes normalized input and parameters deterministically", () => {
    const rows = [point("2025-01-01", 2)];
    expect(snapshotHash({ rows, method: "v1" })).toBe(snapshotHash({ method: "v1", rows }));
    expect(snapshotHash({ at: new Date("2025-01-01T00:00:00Z") })).not.toBe(
      snapshotHash({ at: new Date("2025-01-02T00:00:00Z") })
    );
  });
});
