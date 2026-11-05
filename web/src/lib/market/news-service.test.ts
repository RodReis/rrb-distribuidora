import { describe, expect, it } from "vitest";
import { metadataHash, requireHttpUrl } from "./news-service";
import { parseDate } from "./news-api";

describe("captura manual de notícias", () => {
  const item = {
    title: "Ato publicado",
    canonicalUrl: "https://example.org/ato",
    publishedAt: new Date("2026-11-05T00:00:00.000Z"),
    withdrawn: false,
  };

  it("gera hash estável e distinto para retirada", () => {
    expect(metadataHash(item)).toBe(metadataHash({ ...item }));
    expect(metadataHash(item)).not.toBe(metadataHash({ ...item, withdrawn: true }));
  });

  it("aceita só links HTTP(S)", () => {
    expect(requireHttpUrl("https://example.org/ato")).toBe("https://example.org/ato");
    expect(() => requireHttpUrl("javascript:alert(1)")).toThrow("INVALID_URL");
  });

  it("rejeita data inválida e mantém desconhecida como nula", () => {
    expect(parseDate(null)).toBeNull();
    expect(() => parseDate("inválida")).toThrow("INVALID_DATE");
  });
});
