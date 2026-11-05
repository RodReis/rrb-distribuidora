/**
 * Integração de condições LAC-02 com Postgres real.
 *
 * RUN_DB_TESTS=1 pnpm exec vitest run src/lib/suppliers/service.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { productSupplierTerms, products, suppliers, tenants, users } from "@/lib/db/schema";
import { saveProductSupplierTerm } from "./service";

const enabled = !!process.env.RUN_DB_TESTS;
const tag = `lac02-${Date.now()}`;

describe.skipIf(!enabled)("versionamento de condições LAC-02 (Postgres real)", () => {
  let tenantId = "";
  let otherTenantId = "";
  let userId = "";
  let otherUserId = "";
  let productId = "";
  let firstSupplierId = "";
  let nextSupplierId = "";

  beforeAll(async () => {
    if (!enabled) return;

    const [tenant, otherTenant] = await db
      .insert(tenants)
      .values([
        { name: `Tenant ${tag}`, slug: tag },
        { name: `Outro tenant ${tag}`, slug: `${tag}-outro` },
      ])
      .returning();
    tenantId = tenant.id;
    otherTenantId = otherTenant.id;

    const [user, otherUser] = await db
      .insert(users)
      .values([
        {
          tenantId,
          email: `comprador-${tag}@example.com`,
          name: "Comprador de teste",
          passwordHash: "x",
          role: "comprador",
        },
        {
          tenantId: otherTenantId,
          email: `comprador-outro-${tag}@example.com`,
          name: "Comprador de outro tenant",
          passwordHash: "x",
          role: "comprador",
        },
      ])
      .returning();
    userId = user.id;
    otherUserId = otherUser.id;

    const cnpjBase = Date.now().toString().slice(-12).padStart(12, "0");
    const [firstSupplier, nextSupplier] = await db
      .insert(suppliers)
      .values([
        { tenantId, legalName: `Fornecedor A ${tag}`, cnpj: `${cnpjBase}01` },
        { tenantId, legalName: `Fornecedor B ${tag}`, cnpj: `${cnpjBase}02` },
      ])
      .returning();
    firstSupplierId = firstSupplier.id;
    nextSupplierId = nextSupplier.id;

    const [product] = await db
      .insert(products)
      .values({
        tenantId,
        sku: `SKU-${tag}`,
        family: "chapa_grossa",
        commercialDescription: "Produto de teste LAC-02",
        fiscalDescription: "Produto de teste LAC-02",
        norm: "ASTM A36",
        ncm: "72085100",
        unit: "kg",
        weightPerUnit: "1",
        replacementCostBase: "1",
      })
      .returning();
    productId = product.id;
  });

  afterAll(async () => {
    if (!enabled || !tenantId) return;
    await db.delete(tenants).where(inArray(tenants.id, [tenantId, otherTenantId]));
  });

  it("fecha a versão anterior e permite trocar fornecedor preferido sem apagar histórico", async () => {
    const original = await saveProductSupplierTerm({
      tenantId,
      userId,
      role: "comprador",
      value: {
        productId,
        supplierId: firstSupplierId,
        preferred: true,
        leadTimeDays: 12,
        minimumOrderQty: null,
        unit: null,
        validFrom: "2026-01-01T00:00:00.000Z",
      },
    });

    const next = await saveProductSupplierTerm({
      tenantId,
      userId,
      role: "comprador",
      termId: original.id,
      value: {
        productId,
        supplierId: nextSupplierId,
        preferred: true,
        leadTimeDays: 18,
        minimumOrderQty: 5,
        unit: "kg",
        validFrom: "2026-02-01T00:00:00.000Z",
      },
    });

    const history = await db
      .select()
      .from(productSupplierTerms)
      .where(
        and(
          eq(productSupplierTerms.tenantId, tenantId),
          eq(productSupplierTerms.productId, productId)
        )
      )
      .orderBy(asc(productSupplierTerms.validFrom));

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: original.id,
      supplierId: firstSupplierId,
      preferred: true,
      leadTimeDays: 12,
      validUntil: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(history[1]).toMatchObject({
      id: next.id,
      supplierId: nextSupplierId,
      preferred: true,
      leadTimeDays: 18,
      validUntil: null,
    });
  });

  it("não permite versionar condição de outro tenant", async () => {
    const [term] = await db
      .select()
      .from(productSupplierTerms)
      .where(
        and(
          eq(productSupplierTerms.tenantId, tenantId),
          eq(productSupplierTerms.productId, productId)
        )
      )
      .limit(1);

    await expect(
      saveProductSupplierTerm({
        tenantId: otherTenantId,
        userId: otherUserId,
        role: "comprador",
        termId: term.id,
        value: {
          productId,
          supplierId: nextSupplierId,
          preferred: true,
          leadTimeDays: 21,
          minimumOrderQty: null,
          unit: null,
          validFrom: "2026-03-01T00:00:00.000Z",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exige lote mínimo positivo na unidade cadastrada do produto", async () => {
    await expect(
      saveProductSupplierTerm({
        tenantId,
        userId,
        role: "comprador",
        value: {
          productId,
          supplierId: firstSupplierId,
          preferred: false,
          leadTimeDays: null,
          minimumOrderQty: 5,
          unit: "t",
          validFrom: "2026-03-01T00:00:00.000Z",
        },
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
