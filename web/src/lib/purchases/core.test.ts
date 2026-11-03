import { describe, expect, it } from "vitest";
import { buildPurchaseContent, hashPurchaseContent } from "./hash";
import { computePurchaseLine, computePurchaseTotals, openQuantity, roundMoney } from "./pricing";
import {
  canReceive,
  canTransitionPurchase,
  isEditable,
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUSES,
} from "./state-machine";
import { getPurchaseCapabilities, hasPurchaseCapability } from "./capabilities";
import { validateApprovalMatrixRows } from "./approval-rules";

describe("precificação do pedido de compra", () => {
  it("calcula total da linha com desconto e custos adicionais", () => {
    const line = computePurchaseLine({
      quantity: 2,
      unitPrice: 100,
      discountAmount: 10,
      additionalCosts: [
        { description: "Frete", amount: 25 },
        { description: "Seguro", amount: 5 },
      ],
    });

    expect(line.quantity).toBe(2);
    expect(line.lineTotal).toBe(220); // 200 − 10 + 30
  });

  it("ignora custo adicional sem descrição", () => {
    const line = computePurchaseLine({
      quantity: 1,
      unitPrice: 50,
      additionalCosts: [{ description: "   ", amount: 10 }],
    });
    expect(line.additionalCosts).toHaveLength(0);
    expect(line.lineTotal).toBe(50);
  });

  it("soma totais do pedido separando desconto e custos adicionais", () => {
    const totals = computePurchaseTotals([
      computePurchaseLine({ quantity: 3, unitPrice: 10, discountAmount: 5 }),
      computePurchaseLine({
        quantity: 2,
        unitPrice: 20,
        additionalCosts: [{ description: "Frete", amount: 7.5 }],
      }),
    ]);

    expect(totals.subtotal).toBe(70);
    expect(totals.discountTotal).toBe(5);
    expect(totals.additionalCostsTotal).toBe(7.5);
    expect(totals.grandTotal).toBe(72.5);
  });

  it("arredonda dinheiro em 2 casas sem sujeira de ponto flutuante", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it("calcula saldo aberto do item", () => {
    expect(openQuantity({ quantityOrdered: "10.0000", quantityReceived: "2.5000" })).toBe(7.5);
    expect(openQuantity({ quantityOrdered: "10", quantityReceived: "10" })).toBe(0);
  });
});

describe("hash do conteúdo aprovado", () => {
  const content = buildPurchaseContent({
    supplierId: "11111111-1111-1111-1111-111111111111",
    currency: "BRL",
    expectedDeliveryAt: new Date("2026-11-20T12:00:00.000Z"),
    items: [
      {
        productId: "22222222-2222-2222-2222-222222222222",
        description: "Chapa grossa A36",
        quantity: "10",
        unit: "t",
        unitPrice: "4710.0000",
        discountAmount: "0",
        additionalCosts: [{ description: "Frete", amount: 150.5 }],
        notes: "  entrega única  ",
      },
    ],
  });

  it("é estável para o mesmo conteúdo", () => {
    expect(hashPurchaseContent(content)).toBe(hashPurchaseContent(structuredClone(content)));
    expect(hashPurchaseContent(content)).toHaveLength(64);
  });

  it("muda quando qualquer campo material muda", () => {
    const changed = structuredClone(content);
    changed.items[0].unitPrice = "4711.0000";
    expect(hashPurchaseContent(changed)).not.toBe(hashPurchaseContent(content));

    const changedQty = structuredClone(content);
    changedQty.items[0].quantity = "11.0000";
    expect(hashPurchaseContent(changedQty)).not.toBe(hashPurchaseContent(content));
  });

  it("normaliza ordem de chaves e casas decimais", () => {
    const a = hashPurchaseContent({
      items: [
        {
          unitPrice: "10.0",
          productId: "p",
          description: "d",
          quantity: "1",
          unit: "kg",
          discountAmount: "0",
          additionalCosts: [],
          notes: null,
        },
      ],
      supplierId: "s",
      currency: "BRL",
      expectedDeliveryAt: null,
    });
    const b = hashPurchaseContent({
      currency: "BRL",
      expectedDeliveryAt: null,
      items: [
        {
          description: "d",
          unitPrice: "10.0",
          quantity: "1",
          unit: "kg",
          productId: "p",
          discountAmount: "0",
          additionalCosts: [],
          notes: null,
        },
      ],
      supplierId: "s",
    });
    expect(a).toBe(b);

    // Casas decimais são normalizadas na montagem do conteúdo (buildPurchaseContent).
    const build = (unitPrice: string) =>
      hashPurchaseContent(
        buildPurchaseContent({
          supplierId: "s",
          currency: "BRL",
          expectedDeliveryAt: null,
          items: [
            {
              productId: "p",
              description: "d",
              quantity: "1",
              unit: "kg",
              unitPrice,
              discountAmount: "0",
              additionalCosts: [],
              notes: null,
            },
          ],
        })
      );
    expect(build("10.0")).toBe(build("10.0000"));
  });
});

describe("máquina de estados do pedido", () => {
  it("permite o caminho feliz completo", () => {
    expect(canTransitionPurchase("rascunho", "submetido")).toBe(true);
    expect(canTransitionPurchase("submetido", "aprovado")).toBe(true);
    expect(canTransitionPurchase("aprovado", "emitido")).toBe(true);
    expect(canTransitionPurchase("emitido", "parcialmente_recebido")).toBe(true);
    expect(canTransitionPurchase("parcialmente_recebido", "recebido_completo")).toBe(true);
  });

  it("bloqueia atalhos e estados terminais", () => {
    expect(canTransitionPurchase("rascunho", "emitido")).toBe(false);
    expect(canTransitionPurchase("submetido", "emitido")).toBe(false);
    expect(canTransitionPurchase("rejeitado", "aprovado")).toBe(false);
    expect(canTransitionPurchase("recebido_completo", "cancelado")).toBe(false);
    expect(canTransitionPurchase("cancelado", "rascunho")).toBe(false);
  });

  it("permite reabrir edição apenas nos estados previstos", () => {
    expect(isEditable("rascunho")).toBe(true);
    expect(isEditable("aprovado")).toBe(true);
    expect(isEditable("submetido")).toBe(false);
    expect(isEditable("emitido")).toBe(false);
  });

  it("só permite receber em pedido emitido/parcial", () => {
    expect(canReceive("emitido")).toBe(true);
    expect(canReceive("parcialmente_recebido")).toBe(true);
    expect(canReceive("aprovado")).toBe(false);
    expect(canReceive("rascunho")).toBe(false);
  });

  it("todo estado tem rótulo", () => {
    for (const status of PURCHASE_STATUSES) {
      expect(PURCHASE_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe("capabilities de compras", () => {
  it("nega por padrão", () => {
    expect(getPurchaseCapabilities("papel-inexistente")).toEqual([]);
    expect(hasPurchaseCapability("vendedor", "purchase.read")).toBe(false);
  });

  it("comprador opera o pedido, mas não aprova", () => {
    expect(hasPurchaseCapability("comprador", "purchase.create")).toBe(true);
    expect(hasPurchaseCapability("comprador", "purchase.issue")).toBe(true);
    expect(hasPurchaseCapability("comprador", "purchase.approve")).toBe(false);
  });

  it("diretor aprova, mas não cria/emite", () => {
    expect(hasPurchaseCapability("diretor", "purchase.approve")).toBe(true);
    expect(hasPurchaseCapability("diretor", "purchase.create")).toBe(false);
    expect(hasPurchaseCapability("diretor", "purchase.issue")).toBe(false);
  });

  it("estoque recebe, mas não emite", () => {
    expect(hasPurchaseCapability("estoque", "stock.receive_purchase")).toBe(true);
    expect(hasPurchaseCapability("estoque", "purchase.issue")).toBe(false);
  });
});

describe("validação da matriz de alçadas", () => {
  it("aceita faixas contíguas com última aberta", () => {
    const rows = validateApprovalMatrixRows([
      { minTotal: 0, maxTotal: 5000, approverPermission: "purchase.approve" },
      {
        minTotal: 5000,
        maxTotal: null,
        approverPermission: "purchase.approve",
        requiredApprovals: 2,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].requiredApprovals).toBe(2);
  });

  it("rejeita lacuna", () => {
    expect(() =>
      validateApprovalMatrixRows([
        { minTotal: 0, maxTotal: 5000, approverPermission: "purchase.approve" },
        { minTotal: 6000, maxTotal: null, approverPermission: "purchase.approve" },
      ])
    ).toThrow(/lacuna/i);
  });

  it("rejeita sobreposição", () => {
    expect(() =>
      validateApprovalMatrixRows([
        { minTotal: 0, maxTotal: 5000, approverPermission: "purchase.approve" },
        { minTotal: 4000, maxTotal: null, approverPermission: "purchase.approve" },
      ])
    ).toThrow(/sobreposi/i);
  });

  it("exige primeira faixa em zero e última sem teto", () => {
    expect(() =>
      validateApprovalMatrixRows([
        { minTotal: 100, maxTotal: null, approverPermission: "purchase.approve" },
      ])
    ).toThrow(/R\$ 0,00/);

    expect(() =>
      validateApprovalMatrixRows([
        { minTotal: 0, maxTotal: 5000, approverPermission: "purchase.approve" },
      ])
    ).toThrow(/sem teto/i);
  });

  it("rejeita quantidade de aprovadores fora da faixa", () => {
    expect(() =>
      validateApprovalMatrixRows([
        {
          minTotal: 0,
          maxTotal: null,
          approverPermission: "purchase.approve",
          requiredApprovals: 9,
        },
      ])
    ).toThrow(/aprovadores/i);
  });
});
