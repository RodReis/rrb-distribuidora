import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./movements", () => ({ recordStockAdjustment: vi.fn() }));

import { submitCycleCount } from "./cycle-count";

describe("submitCycleCount - regras de divergência", () => {
  it("exige justificativa quando a contagem diverge do sistema", async () => {
    await expect(
      submitCycleCount({
        tenantId: "t-1",
        lotId: "lot-1",
        countedQty: 95,
        systemQty: 100,
        userId: "u-1",
      })
    ).rejects.toThrow(/Justificativa obrigatória/);
  });

  it("recusa justificativa curta demais", async () => {
    await expect(
      submitCycleCount({
        tenantId: "t-1",
        lotId: "lot-1",
        countedQty: 95,
        systemQty: 100,
        justification: "x",
        userId: "u-1",
      })
    ).rejects.toThrow(/Justificativa obrigatória/);
  });
});
