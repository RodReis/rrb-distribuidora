import { describe, expect, it } from "vitest";
import { formatRemnantCode, isUniqueViolation } from "./remnant-code";

describe("formatRemnantCode", () => {
  it("usa 5 dígitos, como no exemplo da spec (RET-00492)", () => {
    expect(formatRemnantCode(1)).toBe("RET-00001");
    expect(formatRemnantCode(492)).toBe("RET-00492");
    expect(formatRemnantCode(8945)).toBe("RET-08945");
  });

  it("passa de 5 dígitos sem truncar", () => {
    expect(formatRemnantCode(123456)).toBe("RET-123456");
  });

  it("nunca gera zero ou negativo", () => {
    expect(formatRemnantCode(0)).toBe("RET-00001");
    expect(formatRemnantCode(-7)).toBe("RET-00001");
  });
});

describe("isUniqueViolation", () => {
  it("reconhece o código 23505 direto ou dentro de cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("não confunde outros erros", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
