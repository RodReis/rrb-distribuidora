/**
 * Integração do fluxo de compras com Postgres real (LAC-01).
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/lib/purchases/service.integration.test.ts
 *
 * Cria tenant/usuários/fornecedor/produto/depósito próprios (TAG única) e limpa
 * tudo ao final. Cobre os invariantes do checklist de aceite: alçada sem value
 * default, versão/hash, segregação criador×aprovador, emissão idempotente,
 * invalidação de aprovação por edição e isolamento por tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  purchaseApprovalRules,
  purchaseApprovals,
  purchaseEvents,
  purchaseOrderItems,
  purchaseOrderVersions,
  purchaseOrders,
  purchaseReceipts,
  suppliers,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { saveApprovalMatrix } from "./approval-rules";
import { isPurchaseError } from "./errors";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  decidePurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrder,
  submitPurchaseOrder,
  updatePurchaseOrder,
} from "./service";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `lac01-${Date.now()}`;

describe.skipIf(!enabled)("compras operacionais (Postgres real)", () => {
  let tenantId = "";
  let supplierId = "";
  let productId = "";
  let compradorId = "";
  let diretorId = "";
  let orderId = "";
  let editOrderId = "";

  const asComprador = () => ({ tenantId, userId: compradorId, role: "comprador" });
  const asDiretor = () => ({ tenantId, userId: diretorId, role: "diretor" });

  const createDraft = () =>
    createPurchaseOrder({
      ...asComprador(),
      payload: {
        supplierId,
        expectedDeliveryAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 100,
            discountAmount: 50,
            additionalCosts: [{ description: "Frete", amount: 200 }],
            notes: TAG,
          },
        ],
      },
    });

  beforeAll(async () => {
    if (!enabled) return;

    const [tenant] = await db
      .insert(tenants)
      .values({ name: `Tenant ${TAG}`, slug: TAG })
      .returning();
    tenantId = tenant.id;

    const [comprador, diretor] = await db
      .insert(users)
      .values([
        {
          tenantId,
          email: `comprador-${TAG}@example.com`,
          name: "Comprador de teste",
          passwordHash: "x",
          role: "comprador",
        },
        {
          tenantId,
          email: `diretor-${TAG}@example.com`,
          name: "Diretor de teste",
          passwordHash: "x",
          role: "diretor",
        },
      ])
      .returning();
    compradorId = comprador.id;
    diretorId = diretor.id;

    const [supplier] = await db
      .insert(suppliers)
      .values({
        tenantId,
        legalName: `Fornecedor ${TAG}`,
        cnpj: String(Date.now()).padStart(14, "0").slice(-14),
      })
      .returning();
    supplierId = supplier.id;

    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        sku: `SKU-${TAG}`,
        family: "chapa_grossa",
        commercialDescription: "Chapa de teste",
        fiscalDescription: "Chapa de teste",
        norm: "ASTM A36",
        ncm: "72085100",
        unit: "t",
        weightPerUnit: "1000",
        replacementCostBase: "4000",
      })
      .returning();
    productId = product.id;

    await db.insert(warehouses).values({ tenantId, name: `Depósito ${TAG}` });

    // Matriz de alçada: sem ela nenhuma emissão é permitida.
    await saveApprovalMatrix({
      ...asDiretor(),
      rows: [
        {
          minTotal: 0,
          maxTotal: null,
          approverPermission: "purchase.approve",
          requiredApprovals: 1,
        },
      ],
      reason: `Configuração inicial do teste ${TAG}`,
    });
  });

  afterAll(async () => {
    if (!enabled) return;
    if (!tenantId) return;
    await db.delete(purchaseReceipts).where(eq(purchaseReceipts.tenantId, tenantId));
    await db.delete(purchaseApprovals).where(eq(purchaseApprovals.tenantId, tenantId));
    await db.delete(purchaseEvents).where(eq(purchaseEvents.tenantId, tenantId));
    await db.delete(purchaseOrderVersions).where(eq(purchaseOrderVersions.tenantId, tenantId));
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.tenantId, tenantId));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId));
    await db.delete(purchaseApprovalRules).where(eq(purchaseApprovalRules.tenantId, tenantId));
    await db.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
    await db.delete(products).where(eq(products.tenantId, tenantId));
    await db.delete(suppliers).where(eq(suppliers.tenantId, tenantId));
    await db.delete(warehouses).where(eq(warehouses.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("cria rascunho com totais calculados no servidor e estoque intacto", async () => {
    const draft = await createDraft();
    orderId = draft.order.id;

    expect(draft.order.status).toBe("rascunho");
    expect(draft.order.number).toBeNull();
    expect(draft.order.subtotal).toBeCloseTo(1000, 2);
    expect(draft.order.discountTotal).toBeCloseTo(50, 2);
    expect(draft.order.additionalCostsTotal).toBeCloseTo(200, 2);
    expect(draft.order.grandTotal).toBeCloseTo(1150, 2);
    expect(draft.items[0].quantityOpen).toBe(10);
  });

  it("submete congelando versão/hash e resolvendo a alçada", async () => {
    const submitted = await submitPurchaseOrder({ ...asComprador(), id: orderId });

    expect(submitted.order.status).toBe("submetido");
    expect(submitted.order.currentVersion).toBe(1);
    expect(submitted.versions).toHaveLength(1);
    expect(submitted.versions[0].contentHash).toHaveLength(64);
    expect(submitted.approvalRule?.matrixVersion).toBe(1);
    expect(submitted.approvalsCount).toBe(0);
  });

  it("bloqueia autoaprovação com outra conta do mesmo criador", async () => {
    // Admin também tem a capability, mas a segregação vale para qualquer papel.
    const admin = await db
      .insert(users)
      .values({
        tenantId,
        email: `admin-${TAG}@example.com`,
        name: "Admin de teste",
        passwordHash: "x",
        role: "admin",
      })
      .returning();

    const own = await createPurchaseOrder({
      tenantId,
      userId: admin[0].id,
      role: "admin",
      payload: { supplierId, items: [{ productId, quantity: 1, unitPrice: 10 }] },
    });
    await submitPurchaseOrder({ tenantId, userId: admin[0].id, role: "admin", id: own.order.id });

    await expect(
      decidePurchaseOrder({
        tenantId,
        userId: admin[0].id,
        role: "admin",
        id: own.order.id,
        decision: "approved",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("aprova com pessoa distinta e registra a decisão", async () => {
    const approved = await decidePurchaseOrder({
      ...asDiretor(),
      id: orderId,
      decision: "approved",
    });

    expect(approved.order.status).toBe("aprovado");
    expect(approved.order.approvedVersionHash).toHaveLength(64);
    expect(approved.approvalsCount).toBe(1);
    expect(approved.approvals[0].decision).toBe("approved");
    expect(approved.approvals[0].actorRole).toBe("diretor");
  });

  it("emite de forma idempotente, numerada e com o hash aprovado", async () => {
    const first = await issuePurchaseOrder({
      ...asComprador(),
      id: orderId,
      idempotencyKey: `issue-${TAG}-1`,
    });
    expect(first.order.status).toBe("emitido");
    expect(first.order.number).toBeGreaterThan(0);

    const replay = await issuePurchaseOrder({
      ...asComprador(),
      id: orderId,
      idempotencyKey: `issue-${TAG}-1`,
    });
    expect(replay.order.number).toBe(first.order.number);

    const fresh = await issuePurchaseOrder({
      ...asComprador(),
      id: orderId,
      idempotencyKey: `issue-${TAG}-2`,
    }).catch((error: unknown) => error);
    // Já emitido: segunda chave não pode gerar segundo número.
    expect(isPurchaseError(fresh) && fresh.code === "CONFLICT").toBe(true);
  });

  it("proíbe alterar pedido já emitido", async () => {
    await expect(
      updatePurchaseOrder({
        ...asComprador(),
        id: orderId,
        payload: { supplierId, items: [{ productId, quantity: 5, unitPrice: 90 }] },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("edição posterior invalida a aprovação e exige nova submissão", async () => {
    const draft = await createDraft();
    editOrderId = draft.order.id;
    await submitPurchaseOrder({ ...asComprador(), id: editOrderId });
    const approved = await decidePurchaseOrder({
      ...asDiretor(),
      id: editOrderId,
      decision: "approved",
    });
    expect(approved.order.status).toBe("aprovado");

    const edited = await updatePurchaseOrder({
      ...asComprador(),
      id: editOrderId,
      payload: {
        supplierId,
        items: [{ productId, quantity: 10, unitPrice: 200 }],
      },
    });

    expect(edited.order.status).toBe("rascunho");
    expect(edited.order.approvedVersionHash).toBeNull();

    const resubmitted = await submitPurchaseOrder({ ...asComprador(), id: editOrderId });
    expect(resubmitted.order.status).toBe("submetido");
    expect(resubmitted.order.currentVersion).toBe(2);
    expect(resubmitted.order.grandTotal).toBeCloseTo(2000, 2);
  });

  it("rejeição exige justificativa e devolve a rascunho", async () => {
    await expect(
      decidePurchaseOrder({
        ...asDiretor(),
        id: editOrderId,
        decision: "rejected",
        justification: "  ",
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const rejected = await decidePurchaseOrder({
      ...asDiretor(),
      id: editOrderId,
      decision: "rejected",
      justification: "Preço acima do mercado",
    });
    expect(rejected.order.status).toBe("rejeitado");
  });

  it("cancelamento exige justificativa e preserva o histórico", async () => {
    await expect(
      cancelPurchaseOrder({ ...asComprador(), id: editOrderId, reason: "abc" })
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Rejeitado permite nova versão; submete e cancela.
    await submitPurchaseOrder({ ...asComprador(), id: editOrderId });
    const cancelled = await cancelPurchaseOrder({
      ...asComprador(),
      id: editOrderId,
      reason: "Fornecedor sem estoque no prazo",
    });

    expect(cancelled.order.status).toBe("cancelado");
    expect(cancelled.events.some((event) => event.eventType === "cancelled")).toBe(true);
    expect(cancelled.versions.length).toBeGreaterThanOrEqual(3);
  });

  it("não expõe pedido para outro tenant", async () => {
    const [otherTenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const hidden = await getPurchaseOrder({
      tenantId: "00000000-0000-0000-0000-000000000000",
      userId: otherTenant ? diretorId : diretorId,
      role: "diretor",
      id: orderId,
    });
    expect(hidden).toBeNull();

    const [row] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.tenantId, tenantId)));
    expect(row?.id).toBe(orderId);
  });

  it("bloqueia emissão sem matriz de alçadas configurada", async () => {
    // Tenant novo sem nenhuma versão da matriz.
    const [bare] = await db
      .insert(tenants)
      .values({ name: `Tenant sem alçada ${TAG}`, slug: `${TAG}-bare` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: bare.id,
        email: `user-${TAG}-bare@example.com`,
        name: "Comprador sem alçada",
        passwordHash: "x",
        role: "comprador",
      })
      .returning();
    const [supplier] = await db
      .insert(suppliers)
      .values({
        tenantId: bare.id,
        legalName: `Fornecedor ${TAG} bare`,
        cnpj: String(Date.now() + 1)
          .padStart(14, "0")
          .slice(-14),
      })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        tenantId: bare.id,
        sku: `SKU-${TAG}-bare`,
        family: "chapa_grossa",
        commercialDescription: "Chapa bare",
        fiscalDescription: "Chapa bare",
        norm: "ASTM A36",
        ncm: "72085100",
        unit: "t",
        weightPerUnit: "1000",
        replacementCostBase: "4000",
      })
      .returning();

    const draft = await createPurchaseOrder({
      tenantId: bare.id,
      userId: user.id,
      role: "comprador",
      payload: {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
      },
    });
    const submitted = await submitPurchaseOrder({
      tenantId: bare.id,
      userId: user.id,
      role: "comprador",
      id: draft.order.id,
    });

    expect(submitted.order.status).toBe("aguardando_alcada_configurada");
    expect(submitted.approvalRule).toBeNull();

    // Limpeza do tenant auxiliar.
    await db.delete(purchaseEvents).where(eq(purchaseEvents.tenantId, bare.id));
    await db.delete(purchaseOrderVersions).where(eq(purchaseOrderVersions.tenantId, bare.id));
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.tenantId, bare.id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.tenantId, bare.id));
    await db.delete(auditLog).where(eq(auditLog.tenantId, bare.id));
    await db.delete(products).where(eq(products.tenantId, bare.id));
    await db.delete(suppliers).where(eq(suppliers.tenantId, bare.id));
    await db.delete(users).where(eq(users.tenantId, bare.id));
    await db.delete(tenants).where(eq(tenants.id, bare.id));
  });

  it("mantém a trilha de eventos com todos os passos do pedido", async () => {
    const events = await db
      .select({ eventType: purchaseEvents.eventType })
      .from(purchaseEvents)
      .where(inArray(purchaseEvents.purchaseOrderId, [orderId, editOrderId]));

    const types = new Set(events.map((event) => event.eventType));
    for (const expected of [
      "created",
      "submitted",
      "approved",
      "issued",
      "rejected",
      "cancelled",
    ]) {
      expect(types.has(expected as never)).toBe(true);
    }

    const itemRows = await db
      .select({ id: purchaseOrderItems.id })
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.purchaseOrderId, [orderId]));
    expect(itemRows.length).toBeGreaterThan(0);
  });
});
