import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  seasonalityRuns,
  stockLabels,
  stockLots,
  stockMovements,
  stockTransferItems,
  stockTransfers,
  tenants,
  users,
  warehouses,
} from "@/lib/db/schema";
import { issueStockLabel, resolveStockLabel } from "./labels";
import { calculateProductSeasonality } from "./seasonality";
import { transferStock } from "./transfers";
import { qrCodeSvg } from "./qr-code";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `LAC03-FUNC-${Date.now()}`;

describe.skipIf(!enabled)("LAC-03 (Postgres real)", () => {
  let tenantId = "";
  let userId = "";
  let productId = "";
  let fromWarehouseId = "";
  let toWarehouseId = "";
  let testWarehouseId = "";
  let sourceLotId = "";
  const transferIds: string[] = [];
  let seasonalRunId = "";

  beforeAll(async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) throw new Error("Banco de integração precisa de tenant seed.");
    tenantId = tenant.id;
    const [user] = await db.select().from(users).where(eq(users.tenantId, tenantId)).limit(1);
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.status, "ativo")))
      .limit(1);
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.active, true)))
      .limit(1);
    if (!user || !product || !warehouse)
      throw new Error("Banco de integração precisa de usuário, produto ativo e depósito seed.");
    userId = user.id;
    productId = product.id;
    fromWarehouseId = warehouse.id;
    const [destination] = await db
      .insert(warehouses)
      .values({ tenantId, name: TAG, type: "filial", active: true })
      .returning();
    toWarehouseId = destination.id;
    testWarehouseId = destination.id;
    const [lot] = await db
      .insert(stockLots)
      .values({
        tenantId,
        productId,
        warehouseId: fromWarehouseId,
        lotNumber: TAG,
        quantityInitial: "5",
        quantityCurrent: "5",
        unitCost: "2",
        locationAddress: "TESTE LAC-03",
        status: "ativo",
      })
      .returning();
    sourceLotId = lot.id;
  });

  afterAll(async () => {
    if (!enabled || !sourceLotId) return;
    const lots = await db
      .select({ id: stockLots.id })
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.lotNumber, TAG)));
    const lotIds = lots.map((lot) => lot.id);
    const labels = lotIds.length
      ? await db
          .select({ id: stockLabels.id })
          .from(stockLabels)
          .where(and(eq(stockLabels.tenantId, tenantId), inArray(stockLabels.objectId, lotIds)))
      : [];
    const entityIds = [...lotIds, ...transferIds, ...labels.map((label) => label.id)];
    if (entityIds.length) await db.delete(auditLog).where(inArray(auditLog.entityId, entityIds));
    if (labels.length)
      await db.delete(stockLabels).where(
        inArray(
          stockLabels.id,
          labels.map((label) => label.id)
        )
      );
    if (seasonalRunId)
      await db.delete(seasonalityRuns).where(eq(seasonalityRuns.id, seasonalRunId));
    if (transferIds.length) {
      await db
        .delete(stockTransferItems)
        .where(inArray(stockTransferItems.transferId, transferIds));
      await db.delete(stockTransfers).where(inArray(stockTransfers.id, transferIds));
    }
    if (lotIds.length) {
      await db.delete(stockMovements).where(inArray(stockMovements.lotId, lotIds));
      await db.delete(stockLots).where(inArray(stockLots.id, lotIds));
    }
    if (testWarehouseId) await db.delete(warehouses).where(eq(warehouses.id, testWarehouseId));
  });

  it("transfere com idempotência, revoga QR antigo e calcula sazonalidade em 24 meses", async () => {
    const requestKey = randomUUID();
    const transfer = await transferStock({
      tenantId,
      userId,
      requestKey,
      fromWarehouseId,
      toWarehouseId,
      items: [{ lotId: sourceLotId, quantity: 2 }],
    });
    transferIds.push(transfer.id);
    const retry = await transferStock({
      tenantId,
      userId,
      requestKey,
      fromWarehouseId,
      toWarehouseId,
      items: [{ lotId: sourceLotId, quantity: 2 }],
    });
    expect(retry.id).toBe(transfer.id);
    const [source] = await db.select().from(stockLots).where(eq(stockLots.id, sourceLotId));
    expect(Number(source.quantityCurrent)).toBe(3);
    const [destination] = await db
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.tenantId, tenantId), eq(stockLots.warehouseId, toWarehouseId)));
    expect(Number(destination.quantityCurrent)).toBe(2);
    expect(destination.locationAddress).toBeNull();

    const firstLabel = await issueStockLabel({
      tenantId,
      userId,
      objectType: "lote",
      objectId: destination.id,
    });
    const secondLabel = await issueStockLabel({
      tenantId,
      userId,
      objectType: "lote",
      objectId: destination.id,
    });
    expect(await resolveStockLabel(tenantId, firstLabel.token)).toBeNull();
    expect(await resolveStockLabel(tenantId, secondLabel.token)).toMatchObject({
      objectType: "lote",
      lotNumber: TAG,
      quantity: "2.0000",
    });
    expect(qrCodeSvg(`http://localhost${secondLabel.path}`)).toContain("<svg");

    const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const movementDates = Array.from(
      { length: 24 },
      (_, index) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 24 + index, 15, 12))
    );
    await db.insert(stockMovements).values(
      movementDates.map((createdAt) => ({
        tenantId,
        productId,
        lotId: sourceLotId,
        warehouseId: fromWarehouseId,
        movementType: "SAIDA_VENDA",
        quantity: "-1",
        unitCost: "2",
        totalCost: "2",
        referenceDocument: TAG,
        notes: TAG,
        createdBy: userId,
        createdAt,
      }))
    );
    const run = await calculateProductSeasonality({ tenantId, productId, now: end });
    seasonalRunId = run.id;
    expect(run.coverage).toMatchObject({
      observedMonths: 24,
      requiredMonths: 24,
      missingMonths: [],
    });
    expect(run.result).toMatchObject({ status: "ready", monthlyForecast: Array(12).fill(1) });
  }, 60_000);
});
