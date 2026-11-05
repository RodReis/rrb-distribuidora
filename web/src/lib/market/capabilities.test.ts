import { describe, expect, it } from "vitest";
import { hasMarketCapability } from "./capabilities";

describe("permissão de alertas", () => {
  it("nega por padrão e libera apenas papéis configurados", () => {
    expect(hasMarketCapability("admin", "market.alert.configure")).toBe(true);
    expect(hasMarketCapability("comprador", "market.alert.configure")).toBe(true);
    expect(hasMarketCapability("vendedor", "market.alert.configure")).toBe(false);
    expect(hasMarketCapability("desconhecido", "market.alert.configure")).toBe(false);
  });
});

describe("permissões de sinais", () => {
  it("restringe backtest a admin e mantém publicação desligada", () => {
    expect(hasMarketCapability("admin", "market.backtest.execute")).toBe(true);
    expect(hasMarketCapability("comprador", "market.backtest.execute")).toBe(false);
    expect(hasMarketCapability("admin", "market.signal.publish")).toBe(false);
  });
});

describe("permissões LAC-08", () => {
  it("reserva cadastro e revisão ao admin", () => {
    expect(hasMarketCapability("admin", "market.news.manage")).toBe(true);
    expect(hasMarketCapability("admin", "market.news.review")).toBe(true);
    expect(hasMarketCapability("admin", "market.regulatory.manage")).toBe(true);
    expect(hasMarketCapability("diretor", "market.regulatory.read")).toBe(true);
    for (const role of ["diretor", "comprador", "vendedor", "estoque", "financeiro"]) {
      expect(hasMarketCapability(role, "market.news.manage")).toBe(false);
      expect(hasMarketCapability(role, "market.news.review")).toBe(false);
      expect(hasMarketCapability(role, "market.regulatory.manage")).toBe(false);
    }
  });
});
