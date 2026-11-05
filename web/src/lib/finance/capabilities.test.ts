import { describe, expect, it } from "vitest";
import { FINANCE_STATUS, hasFinanceCapability } from "./capabilities";

describe("LAC-09 inativa", () => {
  it.each(["admin", "financeiro", "diretor", "vendedor", "desconhecido"])(
    "nega capacidades para %s",
    (role) => {
      expect(hasFinanceCapability(role, "finance.read")).toBe(false);
      expect(hasFinanceCapability(role, "finance.import")).toBe(false);
      expect(hasFinanceCapability(role, "finance.credit.configure")).toBe(false);
    }
  );

  it("não inventa cobertura, fonte ou data", () => {
    expect(FINANCE_STATUS).toMatchObject({
      available: false,
      coverage: "indisponível",
      source: null,
      updatedAt: null,
    });
  });
});
