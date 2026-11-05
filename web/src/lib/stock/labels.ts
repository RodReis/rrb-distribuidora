import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  auditLog,
  products,
  stockLabels,
  stockLots,
  stockRemnants,
  warehouses,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export class StockLabelError extends Error {}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueStockLabel(input: {
  tenantId: string;
  userId: string;
  objectType: "lote" | "retalho";
  objectId: string;
}) {
  const object =
    input.objectType === "lote"
      ? await db
          .select({ id: stockLots.id })
          .from(stockLots)
          .where(and(eq(stockLots.id, input.objectId), eq(stockLots.tenantId, input.tenantId)))
      : await db
          .select({ id: stockRemnants.id })
          .from(stockRemnants)
          .where(
            and(eq(stockRemnants.id, input.objectId), eq(stockRemnants.tenantId, input.tenantId))
          );
  if (!object.length) throw new StockLabelError("Item não encontrado neste tenant.");

  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    const previous = await tx
      .select({ id: stockLabels.id })
      .from(stockLabels)
      .where(
        and(
          eq(stockLabels.tenantId, input.tenantId),
          eq(stockLabels.objectType, input.objectType),
          eq(stockLabels.objectId, input.objectId),
          eq(stockLabels.status, "ativa")
        )
      );
    await tx
      .update(stockLabels)
      .set({ status: "revogada", revokedAt: new Date() })
      .where(
        and(
          eq(stockLabels.tenantId, input.tenantId),
          eq(stockLabels.objectType, input.objectType),
          eq(stockLabels.objectId, input.objectId),
          eq(stockLabels.status, "ativa")
        )
      );
    const [created] = await tx
      .insert(stockLabels)
      .values({
        tenantId: input.tenantId,
        objectType: input.objectType,
        objectId: input.objectId,
        tokenHash: digest(token),
        status: "ativa",
      })
      .returning({ id: stockLabels.id });
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_labels",
      entityId: created.id,
      action: "insert",
      before: { revokedLabelIds: previous.map((label) => label.id) },
      after: {
        id: created.id,
        objectType: input.objectType,
        objectId: input.objectId,
        status: "ativa",
      },
    });
  });
  return { token, path: `/q/${token}` };
}

export async function resolveStockLabel(tenantId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const [label] = await db
    .select()
    .from(stockLabels)
    .where(
      and(
        eq(stockLabels.tenantId, tenantId),
        eq(stockLabels.tokenHash, digest(token)),
        eq(stockLabels.status, "ativa")
      )
    );
  if (!label) return null;
  if (label.objectType === "lote") {
    const [lot] = await db
      .select({
        id: stockLots.id,
        lotNumber: stockLots.lotNumber,
        heatNumber: stockLots.heatNumber,
        quantity: stockLots.quantityCurrent,
        location: stockLots.locationAddress,
        sku: products.sku,
        description: products.commercialDescription,
        warehouse: warehouses.name,
      })
      .from(stockLots)
      .innerJoin(products, eq(products.id, stockLots.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockLots.warehouseId))
      .where(and(eq(stockLots.id, label.objectId), eq(stockLots.tenantId, tenantId)));
    return lot ? { objectType: label.objectType, ...lot } : null;
  }
  const [remnant] = await db
    .select({
      id: stockRemnants.id,
      code: stockRemnants.code,
      weightKg: stockRemnants.weightKg,
      location: stockRemnants.locationAddress,
      sku: products.sku,
      description: products.commercialDescription,
      warehouse: warehouses.name,
    })
    .from(stockRemnants)
    .innerJoin(products, eq(products.id, stockRemnants.productId))
    .innerJoin(warehouses, eq(warehouses.id, stockRemnants.warehouseId))
    .where(and(eq(stockRemnants.id, label.objectId), eq(stockRemnants.tenantId, tenantId)));
  return remnant ? { objectType: label.objectType, ...remnant } : null;
}
