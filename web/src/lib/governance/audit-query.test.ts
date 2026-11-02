import { describe, expect, it } from "vitest";
import { escapeLike, parseAuditFilters, totalPages } from "./filters";

describe("parseAuditFilters", () => {
  it("aplica os padrões quando a URL está vazia", () => {
    expect(parseAuditFilters({})).toEqual({
      agent: "",
      feedback: "todos",
      q: "",
      page: 1,
      size: 25,
    });
  });

  it("aceita só tamanhos de página permitidos", () => {
    expect(parseAuditFilters({ size: "50" }).size).toBe(50);
    expect(parseAuditFilters({ size: "100" }).size).toBe(100);
    expect(parseAuditFilters({ size: "7" }).size).toBe(25);
    expect(parseAuditFilters({ size: "abc" }).size).toBe(25);
  });

  it("descarta página inválida", () => {
    expect(parseAuditFilters({ page: "3" }).page).toBe(3);
    expect(parseAuditFilters({ page: "0" }).page).toBe(1);
    expect(parseAuditFilters({ page: "-2" }).page).toBe(1);
    expect(parseAuditFilters({ page: "1.5" }).page).toBe(1);
  });

  it("valida o filtro de feedback e limita a busca", () => {
    expect(parseAuditFilters({ feedback: "negativo" }).feedback).toBe("negativo");
    expect(parseAuditFilters({ feedback: "qualquer" }).feedback).toBe("todos");
    expect(parseAuditFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(parseAuditFilters({ agente: ["copilot_chat", "outro"] }).agent).toBe("copilot_chat");
  });
});

describe("escapeLike", () => {
  it("trata % _ e \\ como texto literal", () => {
    expect(escapeLike("100%_ok\\")).toBe("100\\%\\_ok\\\\");
  });
});

describe("totalPages", () => {
  it("nunca devolve menos de 1 página", () => {
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(25, 25)).toBe(1);
    expect(totalPages(26, 25)).toBe(2);
    expect(totalPages(250, 100)).toBe(3);
  });
});
