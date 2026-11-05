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
