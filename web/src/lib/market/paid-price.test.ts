import { describe, expect, it } from "vitest";
import { calculatePaidAverages } from "./paid-price";

describe("média paga", () => {
  it("pondera por quantidade e separa moeda/unidade", () => {
    const values = calculatePaidAverages([
      { quantity: 2, value: 10, currency: "BRL", unit: "kg" },
      { quantity: 1, value: 40, currency: "BRL", unit: "kg" },
      { quantity: 5, value: 99, currency: "USD", unit: "t" },
    ]);
    expect(values).toEqual([
      {
        currency: "BRL",
        unit: "kg",
        quantity: 3,
        value: 20,
        methodVersion: "receipt-unit-cost-v1",
      },
      { currency: "USD", unit: "t", quantity: 5, value: 99, methodVersion: "receipt-unit-cost-v1" },
    ]);
  });
});
