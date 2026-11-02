import { describe, expect, it } from "vitest";
import { resolveAssetSymbol } from "./asset-alias";

describe("resolveAssetSymbol", () => {
  it("mantém símbolos cadastrados", () => {
    expect(resolveAssetSymbol("USD-BRL-PTAX")).toBe("USD-BRL-PTAX");
    expect(resolveAssetSymbol("lme-alu")).toBe("LME-ALU");
    expect(resolveAssetSymbol("CME-HRC")).toBe("CME-HRC");
    expect(resolveAssetSymbol("CN-HRC-FOB")).toBe("CN-HRC-FOB");
  });

  it("resolve o apelido que o modelo realmente usou (PTAX/USD)", () => {
    expect(resolveAssetSymbol("PTAX/USD")).toBe("USD-BRL-PTAX");
    expect(resolveAssetSymbol("USD_BRL")).toBe("USD-BRL-PTAX");
    expect(resolveAssetSymbol("dólar")).toBe("USD-BRL-PTAX");
  });

  it("resolve alumínio e HRC", () => {
    expect(resolveAssetSymbol("Alumínio")).toBe("LME-ALU");
    expect(resolveAssetSymbol("LME_ALU")).toBe("LME-ALU");
    expect(resolveAssetSymbol("HRC")).toBe("CME-HRC");
    expect(resolveAssetSymbol("HRC China")).toBe("CN-HRC-FOB");
  });

  it("devolve o texto normalizado quando não conhece", () => {
    expect(resolveAssetSymbol("níquel lme")).toBe("NIQUEL-LME");
  });
});
