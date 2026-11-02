import { describe, expect, it } from "vitest";
import { AI_TERMS_SECTIONS, AI_TERMS_VERSION, needsAiTermsAcceptance } from "./ai-terms";

describe("needsAiTermsAcceptance", () => {
  it("exige aceite quando nunca aceitou", () => {
    expect(needsAiTermsAcceptance(null)).toBe(true);
    expect(needsAiTermsAcceptance(undefined)).toBe(true);
  });

  it("não exige quando o aceite cobre a versão vigente", () => {
    expect(needsAiTermsAcceptance(AI_TERMS_VERSION)).toBe(false);
  });

  it("exige de novo quando a versão subiu", () => {
    expect(needsAiTermsAcceptance("0.9", "1.0")).toBe(true);
  });

  it("versão antiga não vale como vigente", () => {
    expect(needsAiTermsAcceptance("2.0", "1.0")).toBe(true);
  });
});

describe("AI_TERMS_SECTIONS", () => {
  it("tem as 8 seções da versão 1.0, numeradas e em ordem", () => {
    expect(AI_TERMS_SECTIONS).toHaveLength(8);
    expect(AI_TERMS_SECTIONS.map((s) => s.title)).toEqual([
      "1. Objeto",
      "2. O que a IA é, e o que ela não é",
      "3. Decisões são humanas",
      "4. Dados e rastreabilidade",
      "5. Uso e custos",
      "6. Alterações",
      "7. Responsabilidade",
      "8. Foro",
    ]);
  });

  it("nenhuma seção fica sem texto", () => {
    for (const s of AI_TERMS_SECTIONS) {
      expect(s.paragraphs.length).toBeGreaterThan(0);
      for (const p of s.paragraphs) expect(p.trim().length).toBeGreaterThan(10);
    }
  });
});
