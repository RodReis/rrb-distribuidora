import { describe, expect, it } from "vitest";
import { AUTO_EXPIRE_STATUSES, isAutoExpirable } from "./expiry";

const now = new Date("2026-11-02T15:00:00Z");
const past = new Date("2026-11-01T21:00:00Z");
const future = new Date("2026-11-04T21:00:00Z");

describe("isAutoExpirable", () => {
  it("expira proposta aberta ao cliente com validade vencida", () => {
    expect(isAutoExpirable("enviado", past, now)).toBe(true);
    expect(isAutoExpirable("em_negociacao", past, now)).toBe(true);
  });

  it("não expira antes do vencimento", () => {
    expect(isAutoExpirable("enviado", future, now)).toBe(false);
    expect(isAutoExpirable("em_negociacao", future, now)).toBe(false);
  });

  it("o instante exato do vencimento ainda vale (só depois expira)", () => {
    expect(isAutoExpirable("enviado", now, now)).toBe(false);
    expect(isAutoExpirable("enviado", new Date(now.getTime() - 1), now)).toBe(true);
  });

  it("nunca expira sozinha: rascunho, bloqueada, aprovada ou já encerrada", () => {
    for (const status of ["rascunho", "bloqueado_margem", "aprovado", "perdido", "expirado"]) {
      expect(isAutoExpirable(status, past, now)).toBe(false);
    }
  });

  it("aceita data em texto ISO e ignora data inválida", () => {
    expect(isAutoExpirable("enviado", past.toISOString(), now)).toBe(true);
    expect(isAutoExpirable("enviado", "não é data", now)).toBe(false);
  });

  it("a lista de status expiráveis é exatamente a documentada", () => {
    expect([...AUTO_EXPIRE_STATUSES]).toEqual(["enviado", "em_negociacao"]);
  });
});
