/**
 * Integração com Postgres real. Só roda com RUN_DB_TESTS=1 (o CI não tem banco).
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/lib/purchases/receipts.integration.test.ts
 *
 * Cria tenant/fornecedor/produto/depósito/usuário próprios (TAG única) e remove tudo no
 * final. Cobre o aceite da US-06: recebimento parcial atualiza saldo/estado, retry
 * idempotente não duplica lote/movimento, PC não emitido e PC de outro tenant são
 * recusados sem alterar saldo, excesso é bloqueado, estorno gera compensação e duas
 * requisições concorrentes não ultrapassam a quantidade pedida.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  purchaseEvents,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReceipts,
  stockLots,
  stockMovements,
  suppliers,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { isPurchaseError, type PurchaseError } from "@/lib/purchases/errors";
import {
  registerPurchaseReceipt,
  reversePurchaseReceipt,
  type PurchaseReceiptInput,
} from "@/lib/purchases/receipts";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `rec-${Date.now()}`;

type OrderStatus = (typeof purchaseOrders.$inferInsert)["status"];

async function expectPurchaseError(
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

describe.skipIf(!enabled)("recebimento e estorno contra PC (Postgres real)", () => {
  let tenantId = "";
  let otherTenantId = "";
  let userId = "";
  let supplierId = "";
  let productId = "";
  let warehouseId = "";

  let numberSequence = 0;
  let keySequence = 0;
  let lotSequence = 0;

  const nextNumber = () => 9000 + ++numberSequence;
  const newKey = (prefix = "idem") => `${prefix}-${TAG}-${++keySequence}`;
  const newLot = (prefix = "l") => `LOTE-${TAG}-${prefix}-${++lotSequence}`;

  /**
   * Pedido de compra direto no banco (o fluxo rascunho→emissão tem serviço próprio).
   * Para o PC de outro tenant reaproveitamos fornecedor/produto do tenant A: as FKs
   * são por id e o que o teste precisa provar é o filtro por tenant no recebimento.
   */
  const newOrder = async (
    options: {
      status?: OrderStatus;
      quantity?: string;
      number?: number | null;
      tenantId?: string;
    } = {}
  ) => {
    const targetTenantId = options.tenantId ?? tenantId;
    const status: OrderStatus = options.status ?? "emitido";
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        tenantId: targetTenantId,
        number: options.number === undefined ? nextNumber() : options.number,
        supplierId,
        status,
        createdBy: userId,
        issuedAt: status === "emitido" ? new Date() : null,
        subtotal: "100.00",
        grandTotal: "100.00",
      })
      .returning();

    const [item] = await db
      .insert(purchaseOrderItems)
      .values({
        tenantId: targetTenantId,
        purchaseOrderId: order.id,
        productId,
        productDescriptionSnapshot: `Item ${TAG}`,
        quantityOrdered: options.quantity ?? "10.0000",
        unit: "kg",
        unitPrice: "10.0000",
        lineTotal: "100.00",
      })
      .returning();

    return { order, item };
  };

  const receiptInput = (
    itemId: string,
    overrides: Partial<PurchaseReceiptInput> = {}
  ): PurchaseReceiptInput => ({
    itemId,
    warehouseId,
    quantity: 4,
    lotNumber: newLot(),
    unitCost: 10,
    receivedAt: new Date().toISOString(),
    idempotencyKey: newKey(),
    ...overrides,
  });

  const register = (purchaseOrderId: string, input: PurchaseReceiptInput) =>
    registerPurchaseReceipt({
      tenantId,
      userId,
      role: "estoque",
      purchaseOrderId,
      input,
    });

  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: `Teste Recebimento ${TAG}`, slug: TAG })
      .returning();
    tenantId = tenant.id;
    const [otherTenant] = await db
      .insert(tenants)
      .values({ name: `Teste Outro Tenant ${TAG}`, slug: `${TAG}-outro` })
      .returning();
    otherTenantId = otherTenant.id;

    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        email: `${TAG}@example.com`,
        name: "Estoque Teste",
        passwordHash: "test-only-not-a-hash",
        role: "estoque",
      })
      .returning();
    userId = user.id;

    const [supplier] = await db
      .insert(suppliers)
      .values({
        tenantId,
        legalName: `Fornecedor ${TAG}`,
        tradeName: `Fornecedor ${TAG}`,
        cnpj: `cnpj-${TAG}`,
        type: "distribuidor",
      })
      .returning();
    supplierId = supplier.id;

    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        sku: `SKU-${TAG}`,
        family: "chapa_grossa",
        commercialDescription: `Chapa ${TAG}`,
        fiscalDescription: `Chapa ${TAG}`,
        norm: "ASTM A36",
        ncm: "72085100",
        thicknessMm: "6.3500",
        widthMm: "1200.0000",
        lengthMm: "2400.0000",
        densityGCm3: "7.85",
        unit: "kg",
        weightPerUnit: "1.0000",
        replacementCostBase: "0.0000",
        status: "ativo",
        createdBy: userId,
      })
      .returning();
    productId = product.id;

    const [warehouse] = await db
      .insert(warehouses)
      .values({ tenantId, name: `Depósito ${TAG}`, type: "matriz" })
      .returning();
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    if (!enabled) return;
    const tenantIds = [tenantId, otherTenantId].filter(Boolean);
    if (!tenantIds.length) return;
    // Ordem respeita as FKs sem cascade: auditoria, movimentos, recebimentos e lotes;
    // o resto (pedidos, itens, eventos, produtos, depósitos, usuários) vai em cascata.
    await db.delete(auditLog).where(inArray(auditLog.tenantId, tenantIds));
    await db.delete(stockMovements).where(inArray(stockMovements.tenantId, tenantIds));
    await db.delete(purchaseReceipts).where(inArray(purchaseReceipts.tenantId, tenantIds));
    await db.delete(stockLots).where(inArray(stockLots.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  });

  it("registra recebimento parcial e atualiza saldo, custo de reposição e status", async () => {
    const { order, item } = await newOrder();
    const input = receiptInput(item.id, { quantity: 4, lotNumber: newLot("p1") });

    const { receipt } = await register(order.id, input);

    expect(receipt.id).toBeTruthy();
    expect(receipt.purchaseOrderId).toBe(order.id);
    expect(receipt.purchaseOrderNumberLabel).toBe(`#PC-${String(order.number).padStart(4, "0")}`);
    expect(receipt.quantity).toBe(4);
    expect(receipt.unit).toBe("kg");
    expect(receipt.lotNumber).toBe(input.lotNumber);
    expect(receipt.purchaseOrderStatus).toBe("parcialmente_recebido");
    expect(receipt.itemQuantityOrdered).toBe(10);
    expect(receipt.itemQuantityReceived).toBe(4);
    expect(receipt.itemQuantityOpen).toBe(6);
    expect(receipt.reversedAt).toBeNull();

    const [lot] = await db.select().from(stockLots).where(eq(stockLots.id, receipt.lotId));
    expect(Number(lot.quantityInitial)).toBe(4);
    expect(Number(lot.quantityCurrent)).toBe(4);
    expect(Number(lot.unitCost)).toBe(10);
    expect(lot.supplierId).toBe(supplierId);
    expect(lot.warehouseId).toBe(warehouseId);
    expect(lot.locationAddress).toBe("Galpão Central");

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.lotId, lot.id));
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe("ENTRADA_COMPRA");
    expect(Number(movements[0].quantity)).toBe(4);
    expect(movements[0].referenceDocument).toBe(receipt.purchaseOrderNumberLabel);
    expect(movements[0].createdBy).toBe(userId);

    const [itemRow] = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.id));
    expect(Number(itemRow.quantityReceived)).toBe(4);

    const [orderRow] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, order.id));
    expect(orderRow.status).toBe("parcialmente_recebido");

    const [productRow] = await db.select().from(products).where(eq(products.id, productId));
    expect(Number(productRow.replacementCostBase)).toBe(10);

    const events = await db
      .select()
      .from(purchaseEvents)
      .where(
        and(eq(purchaseEvents.purchaseOrderId, order.id), eq(purchaseEvents.eventType, "received"))
      );
    expect(events).toHaveLength(1);
    expect(events[0].itemId).toBe(item.id);
    expect(events[0].idempotencyKey).toBe(input.idempotencyKey);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantId), inArray(auditLog.entityId, [lot.id, order.id])));
    expect(audits.map((row) => row.entity).sort()).toEqual(["purchase_orders", "stock_lots"]);
  });

  it("completa o pedido em dois recebimentos parciais", async () => {
    const { order, item } = await newOrder();

    const first = await register(
      order.id,
      receiptInput(item.id, { quantity: 4, lotNumber: newLot("p2a") })
    );
    const second = await register(
      order.id,
      receiptInput(item.id, { quantity: 6, lotNumber: newLot("p2b") })
    );

    expect(first.receipt.purchaseOrderStatus).toBe("parcialmente_recebido");
    expect(second.receipt.purchaseOrderStatus).toBe("recebido_completo");
    expect(second.receipt.itemQuantityReceived).toBe(10);
    expect(second.receipt.itemQuantityOpen).toBe(0);

    const [orderRow] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, order.id));
    expect(orderRow.status).toBe("recebido_completo");

    const lots = await db
      .select()
      .from(stockLots)
      .where(inArray(stockLots.lotNumber, [first.receipt.lotNumber, second.receipt.lotNumber]));
    expect(lots).toHaveLength(2);
  });

  it("retry idempotente devolve o mesmo recebimento sem duplicar lote/movimento", async () => {
    const { order, item } = await newOrder();
    const input = receiptInput(item.id, { quantity: 3, lotNumber: newLot("retry") });

    const first = await register(order.id, input);
    const second = await register(order.id, input);

    expect(second.receipt.id).toBe(first.receipt.id);
    expect(second.receipt.createdAt).toBe(first.receipt.createdAt);
    expect(second.receipt.itemQuantityReceived).toBe(3);

    const lots = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.lotNumber, input.lotNumber)));
    expect(lots).toHaveLength(1);

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.lotId, first.receipt.lotId));
    expect(movements).toHaveLength(1);

    const receipts = await db
      .select()
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.purchaseOrderId, order.id));
    expect(receipts).toHaveLength(1);

    // Mesma chave com outra quantidade é conflito, não uma segunda gravação.
    const error = await expectPurchaseError(
      () => register(order.id, { ...input, quantity: 1 }),
      "CONFLICT",
      409
    );
    expect(error.message).toMatch(/quantidade diferente/i);
  });

  it("PC não emitido não recebe e o saldo permanece igual", async () => {
    const { order, item } = await newOrder({ status: "aprovado", number: null });
    const input = receiptInput(item.id, { quantity: 2, lotNumber: newLot("naoemitido") });

    const error = await expectPurchaseError(() => register(order.id, input), "CONFLICT", 409);
    expect(error.message).toMatch(/não aceita recebimento/i);

    const lots = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.lotNumber, input.lotNumber)));
    expect(lots).toHaveLength(0);

    const [itemRow] = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.id));
    expect(Number(itemRow.quantityReceived)).toBe(0);

    const receipts = await db
      .select()
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.purchaseOrderId, order.id));
    expect(receipts).toHaveLength(0);
  });

  it("PC de outro tenant não pode ser recebido", async () => {
    const { order, item } = await newOrder({ tenantId: otherTenantId, number: 1 });
    const input = receiptInput(item.id, { quantity: 2, lotNumber: newLot("outro") });

    await expectPurchaseError(() => register(order.id, input), "NOT_FOUND", 404);

    const lots = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.lotNumber, input.lotNumber)));
    expect(lots).toHaveLength(0);

    const [itemRow] = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.id));
    expect(Number(itemRow.quantityReceived)).toBe(0);
  });

  it("bloqueia excesso e aceita a quantidade exata do saldo aberto", async () => {
    const { order, item } = await newOrder({ quantity: "10.0000" });
    const excessInput = receiptInput(item.id, {
      quantity: 10.5,
      lotNumber: newLot("excesso"),
    });

    const error = await expectPurchaseError(
      () => register(order.id, excessInput),
      "VALIDATION",
      422
    );
    expect(error.message).toMatch(/excesso/i);

    const rejectedLots = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.lotNumber, excessInput.lotNumber)));
    expect(rejectedLots).toHaveLength(0);

    const { receipt } = await register(
      order.id,
      receiptInput(item.id, { quantity: 10, lotNumber: newLot("exato") })
    );
    expect(receipt.purchaseOrderStatus).toBe("recebido_completo");
    expect(receipt.itemQuantityOpen).toBe(0);
  });

  it("estorno cria movimento compensatório, devolve o lote e reduz o saldo", async () => {
    const { order, item } = await newOrder();
    const input = receiptInput(item.id, { quantity: 5, lotNumber: newLot("estorno") });
    const { receipt } = await register(order.id, input);

    const reversalKey = newKey("estorno");
    const reversed = await reversePurchaseReceipt({
      tenantId,
      userId,
      role: "estoque",
      receiptId: receipt.id,
      reason: "Divergência na conferência",
      idempotencyKey: reversalKey,
    });

    expect(reversed.receipt.id).toBe(receipt.id);
    expect(reversed.receipt.reversedAt).not.toBeNull();
    expect(reversed.receipt.reversalReason).toBe("Divergência na conferência");
    expect(reversed.receipt.purchaseOrderStatus).toBe("emitido");
    expect(reversed.receipt.itemQuantityReceived).toBe(0);
    expect(reversed.receipt.itemQuantityOpen).toBe(10);

    const [lot] = await db.select().from(stockLots).where(eq(stockLots.id, receipt.lotId));
    expect(Number(lot.quantityCurrent)).toBe(0);
    expect(lot.status).toBe("esgotado");

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.lotId, lot.id));
    expect(movements).toHaveLength(2);
    const reversalMovement = movements.find(
      (movement) => movement.movementType === "ESTORNO_COMPRA"
    );
    expect(reversalMovement).toBeTruthy();
    expect(Number(reversalMovement!.quantity)).toBe(-5);
    expect(reversalMovement!.referenceDocument).toBe(receipt.purchaseOrderNumberLabel);
    expect(reversalMovement!.notes).toMatch(/Divergência na conferência/);

    const [itemRow] = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.id));
    expect(Number(itemRow.quantityReceived)).toBe(0);

    const [orderRow] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, order.id));
    expect(orderRow.status).toBe("emitido");

    const events = await db
      .select()
      .from(purchaseEvents)
      .where(
        and(
          eq(purchaseEvents.purchaseOrderId, order.id),
          eq(purchaseEvents.eventType, "receipt_reversed")
        )
      );
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ receiptId: receipt.id, quantity: 5 });

    // Retry com a mesma chave: mesmo resultado, sem segundo movimento.
    const replay = await reversePurchaseReceipt({
      tenantId,
      userId,
      role: "estoque",
      receiptId: receipt.id,
      reason: "Divergência na conferência",
      idempotencyKey: reversalKey,
    });
    expect(replay.receipt.id).toBe(receipt.id);
    const movementsAfterReplay = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.lotId, lot.id));
    expect(movementsAfterReplay).toHaveLength(2);

    // Estornar de novo com outra chave é conflito: o histórico não é apagado.
    await expectPurchaseError(
      () =>
        reversePurchaseReceipt({
          tenantId,
          userId,
          role: "estoque",
          receiptId: receipt.id,
          reason: "Segunda tentativa",
          idempotencyKey: newKey("estorno2"),
        }),
      "CONFLICT",
      409
    );
  });

  it("não estorna quando o lote já foi consumido e não tem saldo", async () => {
    const { order, item } = await newOrder();
    const input = receiptInput(item.id, { quantity: 5, lotNumber: newLot("consumido") });
    const { receipt } = await register(order.id, input);

    await db
      .update(stockLots)
      .set({ quantityCurrent: "0.0000", status: "esgotado" })
      .where(eq(stockLots.id, receipt.lotId));

    const error = await expectPurchaseError(
      () =>
        reversePurchaseReceipt({
          tenantId,
          userId,
          role: "estoque",
          receiptId: receipt.id,
          reason: "Tentativa após consumo",
          idempotencyKey: newKey("consumido"),
        }),
      "CONFLICT",
      409
    );
    expect(error.message).toMatch(/consumido/i);

    const [receiptRow] = await db
      .select()
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.id, receipt.id));
    expect(receiptRow.reversedAt).toBeNull();
  });

  it("recebimentos concorrentes não ultrapassam a quantidade pedida", async () => {
    const { order, item } = await newOrder({ quantity: "10.0000" });
    const lotA = newLot("conc-a");
    const lotB = newLot("conc-b");
    const base = {
      itemId: item.id,
      warehouseId,
      quantity: 7,
      unitCost: 10,
      receivedAt: new Date().toISOString(),
    };

    const results = await Promise.allSettled([
      register(order.id, { ...base, lotNumber: lotA, idempotencyKey: newKey("conc-a") }),
      register(order.id, { ...base, lotNumber: lotB, idempotencyKey: newKey("conc-b") }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as
      PromiseRejectedResult | undefined;
    expect(rejected).toBeTruthy();
    expect(isPurchaseError(rejected!.reason)).toBe(true);
    expect((rejected!.reason as PurchaseError).message).toMatch(/saldo aberto/i);

    const [itemRow] = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.id, item.id));
    expect(Number(itemRow.quantityReceived)).toBe(7);

    const lots = await db
      .select()
      .from(stockLots)
      .where(inArray(stockLots.lotNumber, [lotA, lotB]));
    expect(lots).toHaveLength(1);

    const [orderRow] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, order.id));
    expect(orderRow.status).toBe("parcialmente_recebido");
  });
});
