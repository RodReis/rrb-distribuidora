import { describe, expect, it } from "vitest";
import { pluralize, splitBold, stripHeadingMarks } from "./inline-markdown";

describe("splitBold", () => {
  it("separa trechos em negrito", () => {
    expect(splitBold("1. **SKU:** SKU-ALU-5052-476 com **3 dias**")).toEqual([
      { text: "1. ", bold: false },
      { text: "SKU:", bold: true },
      { text: " SKU-ALU-5052-476 com ", bold: false },
      { text: "3 dias", bold: true },
    ]);
  });

  it("texto sem marcação volta inteiro", () => {
    expect(splitBold("sem negrito")).toEqual([{ text: "sem negrito", bold: false }]);
    expect(splitBold("")).toEqual([{ text: "", bold: false }]);
  });

  it("asterisco solto ou não fechado não vira negrito", () => {
    expect(splitBold("a * b ** c")).toEqual([{ text: "a * b ** c", bold: false }]);
  });

  it("não interpreta HTML: o texto passa como está", () => {
    expect(splitBold("<b>x</b> **y**")).toEqual([
      { text: "<b>x</b> ", bold: false },
      { text: "y", bold: true },
    ]);
  });
});

describe("stripHeadingMarks", () => {
  it("tira marcadores de título do começo da linha", () => {
    expect(stripHeadingMarks("### ⚠️ Atenção Imediata")).toBe("⚠️ Atenção Imediata");
    expect(stripHeadingMarks("## Mercado")).toBe("Mercado");
  });

  it("não mexe em # no meio do texto", () => {
    expect(stripHeadingMarks("Proposta #1017 aprovada")).toBe("Proposta #1017 aprovada");
  });
});

describe("pluralize", () => {
  it("1 é singular; 0 e mais de 1 são plural", () => {
    expect(pluralize(1, "liberação", "liberações")).toBe("liberação");
    expect(pluralize(0, "liberação", "liberações")).toBe("liberações");
    expect(pluralize(3, "liberação", "liberações")).toBe("liberações");
  });
});
