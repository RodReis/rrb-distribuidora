import { describe, expect, it } from "vitest";
import {
  applyMarketDelta,
  canTransitionQuoteStatus,
  computeItemPricing,
  computeQuoteValidity,
  formatQuoteNumber,
  hoursUntil,
  isQuoteExpired,
  orderStatusLabel,
  priceFromMargin,
  quoteStatusLabel,
  quoteStatusTone,
  summarizeQuote,
} from "./pricing";

const baseItem = {
  quantity: 2,
  netWeightKg: 10,
  grossWeightKg: 10.5,
  replacementCostPerKg: 10,
  targetMarginPct: 20,
  processMinutesPerPiece: 6,
  machineCostPerHour: 300,
};

describe("computeItemPricing — chapa virgem", () => {
  it("paga matéria-prima pelo peso bruto e aplica margem sobre a venda", () => {
    const result = computeItemPricing(baseItem);

    // material: 10,5 kg × R$ 10 = R$ 105 / peça
    expect(result.unitMaterialCost).toBeCloseTo(105, 2);
    // processo: 6 min de R$ 300/h = R$ 30 / peça
    expect(result.unitProcessCost).toBeCloseTo(30, 2);
    expect(result.unitCost).toBeCloseTo(135, 2);
    // preço = 135 / (1 - 0,20) = 168,75
    expect(result.unitPrice).toBeCloseTo(168.75, 2);
    expect(result.totalItemAmount).toBeCloseTo(337.5, 2);
    expect(result.itemMarginPct).toBeCloseTo(20, 2);
    expect(result.belowTargetMargin).toBe(false);
    expect(result.belowReplacementCost).toBe(false);
    expect(result.usedRemnant).toBe(false);
  });

  it("nunca produz preço abaixo do custo quando a margem é zero", () => {
    const result = computeItemPricing({ ...baseItem, targetMarginPct: 0 });
    expect(result.unitPrice).toBeCloseTo(result.unitCost, 2);
    expect(result.itemMarginPct).toBeCloseTo(0, 2);
  });

  it("bloqueia quando o preço por kg cai abaixo do custo de reposição", () => {
    const result = computeItemPricing({
      ...baseItem,
      // desconto de 40% derruba o preço/kg para R$ 10,13... ainda acima.
      // Aqui forçamos um cenário onde o custo de reposição é alto.
      replacementCostPerKg: 40,
      discountPct: 60,
      processMinutesPerPiece: 0,
      machineCostPerHour: 0,
    });

    expect(result.salePricePerKg).toBeLessThan(40);
    expect(result.belowReplacementCost).toBe(true);
  });
});

describe("computeItemPricing — retalho", () => {
  it("cobra apenas o peso líquido ao custo do retalho", () => {
    const result = computeItemPricing({
      ...baseItem,
      remnant: { costPerKg: 5 },
    });

    // 10 kg líquidos × R$ 5 = R$ 50
    expect(result.unitMaterialCost).toBeCloseTo(50, 2);
    expect(result.unitCost).toBeCloseTo(80, 2);
    expect(result.usedRemnant).toBe(true);
    expect(result.effectiveMaterialCostPerKg).toBe(5);
  });

  it("usa 65% do custo de reposição quando o retalho não informa custo", () => {
    const result = computeItemPricing({
      ...baseItem,
      remnant: {},
    });
    expect(result.effectiveMaterialCostPerKg).toBeCloseTo(6.5, 4);
    expect(result.unitMaterialCost).toBeCloseTo(65, 2);
  });
});

describe("applyMarketDelta", () => {
  it("aplica o delta percentual ao custo base", () => {
    expect(applyMarketDelta(10, 9.5)).toBeCloseTo(10.95, 4);
    expect(applyMarketDelta(10, -5)).toBeCloseTo(9.5, 4);
  });

  it("trava variações acima de ±20%", () => {
    expect(applyMarketDelta(10, 150)).toBeCloseTo(12, 4);
    expect(applyMarketDelta(10, -150)).toBeCloseTo(8, 4);
  });

  it("retorna zero para custo base inválido", () => {
    expect(applyMarketDelta(0, 10)).toBe(0);
    expect(applyMarketDelta(-5, 10)).toBe(0);
  });
});

describe("summarizeQuote", () => {
  const item = {
    totalMaterialCost: 100,
    totalProcessCost: 50,
    totalItemAmount: 200,
    itemMarginPct: 25,
    belowReplacementCost: false,
  };

  it("soma custos, frete, serviços e calcula margem bruta", () => {
    const summary = summarizeQuote({
      items: [item],
      freightCost: 20,
      servicesCost: 10,
      minMarginPct: 18,
    });

    expect(summary.totalMaterialCost).toBe(100);
    expect(summary.totalProcessCost).toBe(50);
    expect(summary.totalAmount).toBe(230);
    expect(summary.totalCost).toBe(180);
    // (230 - 180) / 230 = 21,74%
    expect(summary.grossMarginPct).toBeCloseTo(21.74, 2);
    expect(summary.blocked).toBe(false);
    expect(summary.blockReasons).toHaveLength(0);
  });

  it("bloqueia por margem abaixo da política", () => {
    const summary = summarizeQuote({
      items: [{ ...item, totalItemAmount: 150 }],
      freightCost: 0,
      servicesCost: 0,
      minMarginPct: 30,
    });

    expect(summary.grossMarginPct).toBeLessThan(30);
    expect(summary.blocked).toBe(true);
    expect(summary.blockReasons[0]).toMatch(/Margem bruta/);
  });

  it("bloqueia por item abaixo do custo de reposição", () => {
    const summary = summarizeQuote({
      items: [{ ...item, belowReplacementCost: true }],
      freightCost: 0,
      servicesCost: 0,
      minMarginPct: 10,
    });

    expect(summary.blocked).toBe(true);
    expect(summary.blockReasons[0]).toMatch(/abaixo do custo de reposição/i);
  });

  it("acumula os dois motivos de bloqueio", () => {
    const summary = summarizeQuote({
      items: [{ ...item, belowReplacementCost: true, totalItemAmount: 100 }],
      freightCost: 0,
      servicesCost: 0,
      minMarginPct: 25,
    });
    expect(summary.blockReasons).toHaveLength(2);
  });

  it("separa bloqueio de margem do piso de custo de reposição", () => {
    const onlyMargin = summarizeQuote({
      items: [{ ...item, belowReplacementCost: false, totalItemAmount: 100 }],
      freightCost: 0,
      servicesCost: 0,
      minMarginPct: 30,
    });
    expect(onlyMargin.blocked).toBe(true);
    expect(onlyMargin.belowReplacementCost).toBe(false);

    const hardFloor = summarizeQuote({
      items: [{ ...item, belowReplacementCost: true, totalItemAmount: 100 }],
      freightCost: 0,
      servicesCost: 0,
      minMarginPct: 10,
    });
    expect(hardFloor.belowReplacementCost).toBe(true);
  });
});

describe("computeQuoteValidity", () => {
  const now = new Date("2026-11-02T10:00:00.000Z");

  it("mercado calmo gera 7 dias fechando às 18h", () => {
    const result = computeQuoteValidity(0.5, now);
    expect(result.hours).toBe(168);
    expect(result.validUntil.getHours()).toBe(18);
    expect(result.validUntil.getMinutes()).toBe(0);
  });

  it("volatilidade acima de 1,5% reduz para 72h", () => {
    const result = computeQuoteValidity(2, now);
    expect(result.hours).toBe(72);
    expect(result.validUntil.getTime() - now.getTime()).toBe(72 * 3600 * 1000);
  });

  it("volatilidade acima de 3% reduz para 48h", () => {
    const result = computeQuoteValidity(3.5, now);
    expect(result.hours).toBe(48);
    expect(result.validUntil.getTime() - now.getTime()).toBe(48 * 3600 * 1000);
  });

  it("trata valores inválidos como mercado calmo", () => {
    const result = computeQuoteValidity(Number.NaN, now);
    expect(result.hours).toBe(168);
  });
});

describe("helpers de validade e status", () => {
  it("hoursUntil nunca retorna negativo", () => {
    const now = new Date("2026-11-02T10:00:00.000Z");
    expect(hoursUntil(new Date("2026-11-02T13:00:00.000Z"), now)).toBe(3);
    expect(hoursUntil(new Date("2026-11-01T10:00:00.000Z"), now)).toBe(0);
  });

  it("isQuoteExpired compara com o relógio", () => {
    const now = new Date("2026-11-02T10:00:00.000Z");
    expect(isQuoteExpired(new Date("2026-11-02T09:59:00.000Z"), now)).toBe(true);
    expect(isQuoteExpired(new Date("2026-11-02T10:01:00.000Z"), now)).toBe(false);
  });

  it("formata número do orçamento a partir da sequência", () => {
    expect(formatQuoteNumber(1)).toBe("#1001");
    expect(formatQuoteNumber("42")).toBe("#1042");
    expect(formatQuoteNumber("abc")).toBe("—");
  });

  it("mapeia status para rótulo e tom visual", () => {
    expect(quoteStatusLabel("bloqueado_margem")).toBe("Bloqueado por margem");
    expect(quoteStatusTone("bloqueado_margem")).toBe("risk");
    expect(quoteStatusTone("aprovado")).toBe("buy");
    expect(quoteStatusTone("status_inexistente")).toBe("hold");
  });

  it("traduz o status do pedido de venda para a interface", () => {
    expect(orderStatusLabel("aguardando_producao")).toBe("Aguardando produção");
    expect(orderStatusLabel("pronto_faturamento")).toBe("Pronto para faturamento");
    expect(orderStatusLabel("status_bruto")).toBe("status_bruto");
  });

  it("priceFromMargin é o inverso da margem bruta", () => {
    expect(priceFromMargin(80, 20)).toBeCloseTo(100, 2);
    expect(priceFromMargin(100, 0)).toBeCloseTo(100, 2);
    expect(priceFromMargin(100, 100)).toBeCloseTo(100, 2);
  });
});

describe("canTransitionQuoteStatus", () => {
  it("percorre o funil feliz", () => {
    expect(canTransitionQuoteStatus("rascunho", "enviado")).toBe(true);
    expect(canTransitionQuoteStatus("enviado", "em_negociacao")).toBe(true);
    expect(canTransitionQuoteStatus("em_negociacao", "aprovado")).toBe(true);
  });

  it("não deixa pular etapas do funil", () => {
    expect(canTransitionQuoteStatus("rascunho", "aprovado")).toBe(false);
    expect(canTransitionQuoteStatus("enviado", "aprovado")).toBe(false);
    expect(canTransitionQuoteStatus("rascunho", "em_negociacao")).toBe(false);
  });

  it("bloqueio de margem só volta por liberação", () => {
    expect(canTransitionQuoteStatus("bloqueado_margem", "rascunho")).toBe(true);
    expect(canTransitionQuoteStatus("bloqueado_margem", "enviado")).toBe(false);
    expect(canTransitionQuoteStatus("bloqueado_margem", "aprovado")).toBe(false);
  });

  it("perdido e expirado são terminais", () => {
    for (const status of [
      "rascunho",
      "enviado",
      "em_negociacao",
      "aprovado",
      "expirado",
    ] as const) {
      expect(canTransitionQuoteStatus("perdido", status)).toBe(false);
    }
    expect(canTransitionQuoteStatus("expirado", "rascunho")).toBe(false);
  });

  it("permite encerrar qualquer proposta aberta", () => {
    expect(canTransitionQuoteStatus("rascunho", "perdido")).toBe(true);
    expect(canTransitionQuoteStatus("enviado", "expirado")).toBe(true);
    expect(canTransitionQuoteStatus("aprovado", "expirado")).toBe(true);
  });

  it("transição para o mesmo status é idempotente", () => {
    expect(canTransitionQuoteStatus("enviado", "enviado")).toBe(true);
  });
});
