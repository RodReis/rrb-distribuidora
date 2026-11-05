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
