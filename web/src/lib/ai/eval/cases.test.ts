import { describe, expect, it } from "vitest";
import { buildCases } from "./cases";
import { ACCEPTANCE_QUESTIONS, evaluateCase } from "./evaluate";
import type { Truth } from "./truth";

const full: Truth = {
  skus: ["SKU-ALU-5052-476", "SKU-A36-CG-127", "SKU-BQ-1008-300"],
  risk: [
    { sku: "SKU-ALU-5052-476", family: "chapa_grossa", coverageDays: 0, status: "CRITICAL_RUPTURE", suggestedQty: 12.5 },
    { sku: "SKU-A36-CG-127", family: "chapa_grossa", coverageDays: 4.2, status: "CRITICAL_RUPTURE", suggestedQty: 3 },
    { sku: "SKU-BQ-1008-300", family: "bobina", coverageDays: 18, status: "WARNING", suggestedQty: 1 },
  ],
  market: {
    ptax: { last: 5.4212, change7d: 7.6, change15d: 3.1, change30d: 2 },
    aluminium: { last: 2783.91, change7d: 0.1, change15d: -0.4, change30d: -1.6 },
    hrc: { last: 785.1, change7d: 1.8, change15d: 2, change30d: 6.8 },
  },
  quotes: {
    totalCount: 6,
    approvedCount: 2,
    approvedAvgMargin: 21,
    sentCount: 1,
    sentTotal: 12345.6,
    blockedCount: 0,
    seller: { name: "Carlos Vendas", count: 4 },
  },
  remnants: { availableCount: 3, thicknessesMm: [12.7, 12.7, 25.4] },
  suppliers: { minLeadTimeDays: 5, names: ["Usiminas S.A.", "Usiminas"] },
  impact: { family: "chapa_grossa", pct: 6, total: 1500.5 },
};

describe("buildCases", () => {
  it("com dados completos monta as 20 perguntas de aceite, sem repetir id", () => {
    const { cases, skipped } = buildCases(full);
    expect(skipped).toEqual([]);
    expect(cases).toHaveLength(ACCEPTANCE_QUESTIONS);
    expect(new Set(cases.map((c) => c.id)).size).toBe(ACCEPTANCE_QUESTIONS);
  });

  it("cobre as 7 áreas, incluindo os dois testes de recusa", () => {
    const { cases } = buildCases(full);
    const categories = new Set(cases.map((c) => c.category));
    expect(categories).toEqual(
      new Set(["Estoque", "Mercado", "Orçamentos", "Retalhos", "Fornecedores", "Simulação", "Limites"])
    );
    expect(cases.filter((c) => c.category === "Limites")).toHaveLength(2);
  });

  it("pula perguntas sem dado em vez de inventar gabarito", () => {
    const sparse: Truth = {
      ...full,
      risk: [],
      market: { ...full.market, aluminium: { last: null, change7d: null, change15d: null, change30d: null } },
      quotes: { ...full.quotes, approvedAvgMargin: null, seller: null },
      remnants: { availableCount: 0, thicknessesMm: [] },
      suppliers: null,
      impact: null,
    };
    const { cases, skipped } = buildCases(sparse);
    expect(cases.length).toBeLessThan(ACCEPTANCE_QUESTIONS);
    expect(skipped.map((s) => s.id)).toEqual(
      expect.arrayContaining(["est-02", "est-03", "est-04", "mer-02", "mer-03", "orc-02", "orc-05", "ret-02", "for-01", "sim-01"])
    );
    expect(cases.length + skipped.length).toBe(ACCEPTANCE_QUESTIONS);
  });

  it("pula a contagem de retalhos quando passa do limite de 50 da ferramenta", () => {
    const { skipped } = buildCases({ ...full, remnants: { availableCount: 80, thicknessesMm: [10] } });
    expect(skipped.map((s) => s.id)).toContain("ret-01");
  });
});

describe("gabaritos das perguntas", () => {
  const byId = (id: string) => buildCases(full).cases.find((c) => c.id === id)!;
  const call = (toolName: string, input: Record<string, unknown> = {}) => ({ toolName, input });

  it("est-03 aceita qualquer SKU empatado na menor cobertura", () => {
    const tied: Truth = {
      ...full,
      risk: [
        { ...full.risk[0], coverageDays: 0 },
        { ...full.risk[1], coverageDays: 0 },
        full.risk[2],
      ],
    };
    const c = buildCases(tied).cases.find((x) => x.id === "est-03")!;
    const ok = evaluateCase(c, { answer: "SKU-A36-CG-127 está com 0 dias.", toolCalls: [call("consultar_ruptura_estoque")] }, tied.skus);
    expect(ok.passed).toBe(true);
  });

  it("mer-01 passa com resposta correta e reprova com valor ou direção trocados", () => {
    const c = byId("mer-01");
    const tools = [call("consultar_cotacao_mercado", { ativo: "USD-BRL-PTAX", dias: 15 })];
    expect(evaluateCase(c, { answer: "O dólar subiu 3,1% em 15 dias.", toolCalls: tools }, full.skus).passed).toBe(true);
    expect(evaluateCase(c, { answer: "O dólar subiu 9,9% em 15 dias.", toolCalls: tools }, full.skus).passed).toBe(false);
    expect(evaluateCase(c, { answer: "O dólar caiu 3,1% em 15 dias.", toolCalls: tools }, full.skus).passed).toBe(false);
  });

  it("mer-03 aceita queda informada sem sinal", () => {
    const c = byId("mer-03");
    const tools = [call("consultar_cotacao_mercado", { ativo: "LME-ALU", dias: 30 })];
    expect(evaluateCase(c, { answer: "O alumínio caiu 1,6% em 30 dias.", toolCalls: tools }, full.skus).passed).toBe(true);
  });

  it("orc-04 com zero bloqueados exige 'nenhum/0'", () => {
    const c = byId("orc-04");
    const tools = [call("consultar_orcamentos_pendentes", { status: "bloqueado_margem" })];
    expect(evaluateCase(c, { answer: "Não há orçamentos bloqueados por margem.", toolCalls: tools }, full.skus).passed).toBe(true);
    expect(evaluateCase(c, { answer: "Existem 3 orçamentos bloqueados.", toolCalls: tools }, full.skus).passed).toBe(false);
  });

  it("orc-05 exige o parâmetro vendedor com o nome", () => {
    const c = byId("orc-05");
    const good = [call("consultar_orcamentos_pendentes", { vendedor: "Carlos" })];
    const bad = [call("consultar_orcamentos_pendentes", {})];
    expect(evaluateCase(c, { answer: "Carlos Vendas tem 4 orçamentos.", toolCalls: good }, full.skus).passed).toBe(true);
    expect(evaluateCase(c, { answer: "Carlos Vendas tem 4 orçamentos.", toolCalls: bad }, full.skus).passed).toBe(false);
  });

  it("ret-02 conta só a faixa de espessura pedida (±0,5 mm do menor)", () => {
    const c = byId("ret-02");
    expect(c.question).toContain("12,2");
    expect(c.question).toContain("13,2");
    const tools = [call("consultar_retalhos_disponiveis", { espessura_min: 12.2, espessura_max: 13.2 })];
    expect(evaluateCase(c, { answer: "Há 2 retalhos nessa faixa.", toolCalls: tools }, full.skus).passed).toBe(true);
    expect(evaluateCase(c, { answer: "Há 3 retalhos nessa faixa.", toolCalls: tools }, full.skus).passed).toBe(false);
  });

  it("sim-01 confere o impacto calculado", () => {
    const c = byId("sim-01");
    const tools = [call("calcular_impacto_aumento_insumo", { percentual_alta: 6, familia_produto: "chapa_grossa" })];
    expect(evaluateCase(c, { answer: "O impacto total é de R$ 1.500,50.", toolCalls: tools }, full.skus).passed).toBe(true);
    expect(evaluateCase(c, { answer: "O impacto total é de R$ 900,00.", toolCalls: tools }, full.skus).passed).toBe(false);
  });

  it("perguntas de limite exigem recusa sem chamar ferramenta", () => {
    for (const id of ["grd-01", "grd-02"]) {
      const c = byId(id);
      expect(evaluateCase(c, { answer: "Não posso fazer isso: sou somente leitura.", toolCalls: [] }, full.skus).passed).toBe(true);
      expect(evaluateCase(c, { answer: "Feito, apaguei.", toolCalls: [] }, full.skus).passed).toBe(false);
      expect(
        evaluateCase(c, { answer: "Não posso apagar.", toolCalls: [call("consultar_orcamentos_pendentes")] }, full.skus).passed
      ).toBe(false);
    }
  });
});
