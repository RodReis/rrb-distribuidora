import { describe, expect, it } from "vitest";
import { effectiveLabel, permittedNewsFields } from "./news";

describe("direitos de exibição de notícias", () => {
  const item = {
    id: "item-1",
    sourceName: "Fonte",
    title: "Título",
    canonicalUrl: "https://example.com/item-1",
    publishedAt: null,
    body: "Conteúdo licenciado",
    evidence: "Trecho licenciado",
    rights: "metadata" as const,
  };

  it("remove conteúdo e evidência quando direitos permitem só metadados", () => {
    expect(permittedNewsFields(item)).toEqual({
      id: "item-1",
      sourceName: "Fonte",
      title: "Título",
      canonicalUrl: "https://example.com/item-1",
      publishedAt: null,
    });
  });

  it("omite fonte sem permissão de exibição", () => {
    expect(permittedNewsFields({ ...item, rights: "none" })).toBeNull();
  });

  it("expõe conteúdo somente com direito integral", () => {
    expect(permittedNewsFields({ ...item, rights: "full" })).toMatchObject({
      body: "Conteúdo licenciado",
      evidence: "Trecho licenciado",
    });
  });

  it("não inventa vigência para ato sem data confirmada", () => {
    expect(effectiveLabel(null, null)).toBe("Vigência indeterminada");
  });
});
