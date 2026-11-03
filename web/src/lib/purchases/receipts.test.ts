import { describe, expect, it } from "vitest";
import { isPurchaseError, type PurchaseError } from "./errors";
import {
  assertReceiptWithinOpenQuantity,
  deriveStatusAfterReceipt,
  deriveStatusAfterReversal,
  receivedQuantityAfterReceipt,
  receivedQuantityAfterReversal,
  registerPurchaseReceipt,
  reversePurchaseReceipt,
} from "./receipts";

/**
 * Regras puras do recebimento (LAC-01 US-06), sem banco.
 *
 * Cobrem o que é fácil de quebrar em silêncio: excesso contra o saldo aberto,
 * arredondamento decimal, estado resultante do pedido e devolução no estorno.
 */

function expectPurchaseError(fn: () => unknown, code: string, status: number): PurchaseError {
  try {
    fn();
  } catch (error) {
    expect(isPurchaseError(error)).toBe(true);
    const purchaseError = error as PurchaseError;
    expect(purchaseError.code).toBe(code);
    expect(purchaseError.status).toBe(status);
    return purchaseError;
  }
  throw new Error("Esperava um erro de domínio de compras.");
}

async function expectPurchaseRejection(
  fn: () => Promise<unknown>,
  code: string,
  status: number
): Promise<PurchaseError> {
  try {
    await fn();
  } catch (error) {
    expect(isPurchaseError(error)).toBe(true);
    const purchaseError = error as PurchaseError;
    expect(purchaseError.code).toBe(code);
    expect(purchaseError.status).toBe(status);
    return purchaseError;
  }
  throw new Error("Esperava um erro de domínio de compras.");
}

/**
 * Guardas que rodam antes de qualquer acesso ao banco: capability, chave de
 * idempotência e justificativa do estorno. Sem banco aqui de propósito.
 */
describe("guardas do recebimento por capability e entrada", () => {
  const baseReceipt = {
    itemId: "11111111-1111-1111-1111-111111111111",
    warehouseId: "22222222-2222-2222-2222-222222222222",
    quantity: 1,
    lotNumber: "LOTE-1",
    unitCost: 10,
    idempotencyKey: "chave-de-teste-123",
  };

  it("recebimento exige a capability stock.receive_purchase (403)", async () => {
    const error = await expectPurchaseRejection(
      () =>
        registerPurchaseReceipt({
          tenantId: "t-1",
          userId: "u-1",
          role: "vendedor",
          purchaseOrderId: "p-1",
          input: baseReceipt,
        }),
      "FORBIDDEN",
      403
    );
    expect(error.message).toMatch(/stock\.receive_purchase/);
  });

  it("recebimento sem chave de idempotência é validação (422)", async () => {
    await expectPurchaseRejection(
      () =>
        registerPurchaseReceipt({
          tenantId: "t-1",
          userId: "u-1",
          role: "estoque",
          purchaseOrderId: "p-1",
          input: { ...baseReceipt, idempotencyKey: "   " },
        }),
      "VALIDATION",
      422
    );
  });

  it("estorno exige a capability stock.receive_purchase (403)", async () => {
    await expectPurchaseRejection(
      () =>
        reversePurchaseReceipt({
          tenantId: "t-1",
          userId: "u-1",
          role: "diretor",
          receiptId: "r-1",
          reason: "Divergência na conferência",
          idempotencyKey: "chave-de-teste-456",
        }),
      "FORBIDDEN",
      403
    );
  });

  it("estorno exige justificativa de ao menos 5 caracteres (422)", async () => {
    await expectPurchaseRejection(
      () =>
        reversePurchaseReceipt({
          tenantId: "t-1",
          userId: "u-1",
          role: "estoque",
          receiptId: "r-1",
          reason: "abc",
          idempotencyKey: "chave-de-teste-789",
        }),
      "VALIDATION",
      422
    );
  });
});

describe("assertReceiptWithinOpenQuantity", () => {
  it("aceita quantidade dentro do saldo aberto e devolve a quantidade normalizada", () => {
    const quantity = assertReceiptWithinOpenQuantity(
      { quantityOrdered: "10.0000", quantityReceived: "3.0000" },
      4
    );
    expect(quantity).toBe(4);
  });

  it("aceita exatamente o saldo aberto (recebimento total)", () => {
    const quantity = assertReceiptWithinOpenQuantity(
      { quantityOrdered: "10.0000", quantityReceived: "3.0000" },
      7
    );
    expect(quantity).toBe(7);
  });

  it("normaliza a quantidade para 4 casas decimais", () => {
    const quantity = assertReceiptWithinOpenQuantity(
      { quantityOrdered: "0.3000", quantityReceived: "0.0000" },
      0.3
    );
    expect(quantity).toBe(0.3);

    // 0,30004 arredonda para 0,3 e ainda cabe no saldo aberto.
    expect(
      assertReceiptWithinOpenQuantity(
        { quantityOrdered: "0.3000", quantityReceived: "0.0000" },
        0.30004
      )
    ).toBe(0.3);
  });

  it("rejeita excesso: esta versão não tem tolerância", () => {
    const error = expectPurchaseError(
      () =>
        assertReceiptWithinOpenQuantity(
          { quantityOrdered: "10.0000", quantityReceived: "3.0000" },
          7.0001
        ),
      "VALIDATION",
      422
    );
    expect(error.message).toMatch(/excesso/i);
    expect(error.message).toMatch(/saldo aberto/i);
  });

  it("rejeita quantidade zero, negativa ou não numérica", () => {
    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectPurchaseError(
        () =>
          assertReceiptWithinOpenQuantity(
            { quantityOrdered: "10.0000", quantityReceived: "0.0000" },
            quantity
          ),
        "VALIDATION",
        422
      );
    }
  });

  it("rejeita qualquer nova quantidade quando o item já está completo", () => {
    expectPurchaseError(
      () =>
        assertReceiptWithinOpenQuantity(
          { quantityOrdered: "5.0000", quantityReceived: "5.0000" },
          0.0001
        ),
      "VALIDATION",
      422
    );
  });
});

describe("deriveStatusAfterReceipt", () => {
  it("fica parcialmente recebido quando ainda há saldo aberto", () => {
    expect(deriveStatusAfterReceipt([{ quantityOrdered: "10", quantityReceived: "4" }])).toBe(
      "parcialmente_recebido"
    );
  });

  it("fica recebido completo quando todos os itens fecham", () => {
    expect(
      deriveStatusAfterReceipt([
        { quantityOrdered: "10", quantityReceived: "10" },
        { quantityOrdered: "2.5000", quantityReceived: "2.5000" },
      ])
    ).toBe("recebido_completo");
  });

  it("continua parcial quando um entre vários itens ainda está aberto", () => {
    expect(
      deriveStatusAfterReceipt([
        { quantityOrdered: "10", quantityReceived: "10" },
        { quantityOrdered: "2.5000", quantityReceived: "1.0000" },
      ])
    ).toBe("parcialmente_recebido");
  });

  it("não deixa resíduo binário impedir a conclusão do pedido", () => {
    expect(deriveStatusAfterReceipt([{ quantityOrdered: "0.1", quantityReceived: "0.1" }])).toBe(
      "recebido_completo"
    );
  });
});

describe("deriveStatusAfterReversal", () => {
  it("volta para emitido quando não resta nenhuma quantidade recebida", () => {
    expect(
      deriveStatusAfterReversal([
        { quantityOrdered: "10", quantityReceived: "0" },
        { quantityOrdered: "5", quantityReceived: "0.0000" },
      ])
    ).toBe("emitido");
  });

  it("volta para parcialmente recebido quando ainda há recebimento válido", () => {
    expect(
      deriveStatusAfterReversal([
        { quantityOrdered: "10", quantityReceived: "4" },
        { quantityOrdered: "5", quantityReceived: "0" },
      ])
    ).toBe("parcialmente_recebido");
  });
});

describe("receivedQuantityAfterReceipt", () => {
  it("soma o recebimento ao saldo do item (valores vem do banco como string)", () => {
    expect(receivedQuantityAfterReceipt("3.0000", 2.5)).toBe(5.5);
  });

  it("arredonda para 4 casas sem resíduo binário", () => {
    expect(receivedQuantityAfterReceipt("0.1000", 0.2)).toBe(0.3);
  });
});

describe("receivedQuantityAfterReversal", () => {
  it("desconta a quantidade estornada do saldo do item", () => {
    expect(receivedQuantityAfterReversal("5.0000", 2)).toBe(3);
  });

  it("zera o saldo no estorno total", () => {
    expect(receivedQuantityAfterReversal("10.0000", 10)).toBe(0);
  });

  it("recusa estorno que deixaria a quantidade recebida negativa", () => {
    const error = expectPurchaseError(
      () => receivedQuantityAfterReversal("1.0000", 2),
      "CONFLICT",
      409
    );
    expect(error.message).toMatch(/negativa/i);
  });
});
