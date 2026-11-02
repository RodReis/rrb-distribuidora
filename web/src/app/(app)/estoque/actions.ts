"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import {
  recordStockEntry,
  recordStockOut,
  recordStockAdjustment,
  createRemnant,
  reserveRemnant,
  releaseRemnant,
  scrapRemnant,
} from "@/lib/stock/movements";
import { submitCycleCount } from "@/lib/stock/cycle-count";
import { importInitialStockCsv } from "@/lib/stock/import-stock";
import { recalculatePredictiveMetricsForTenant } from "@/lib/stock/predictive-engine";

export async function createStockEntryAction(data: {
  productId: string;
  warehouseId: string;
  lotNumber: string;
  heatNumber?: string;
  supplierId?: string;
  quantity: number;
  unitCost: number;
  locationAddress?: string;
  referenceDocument?: string;
  notes?: string;
}) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await recordStockEntry({
    tenantId: user.tenantId,
    productId: data.productId,
    warehouseId: data.warehouseId,
    lotNumber: data.lotNumber,
    heatNumber: data.heatNumber,
    supplierId: data.supplierId,
    quantity: data.quantity,
    unitCost: data.unitCost,
    locationAddress: data.locationAddress,
    referenceDocument: data.referenceDocument,
    notes: data.notes,
    userId: user.id,
  });

  revalidatePath("/estoque");
  return result;
}

export async function createStockOutAction(data: {
  productId: string;
  lotId: string;
  quantity: number;
  movementType?: "SAIDA_VENDA" | "CORTE_CONSUMO";
  referenceDocument?: string;
  notes?: string;
}) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await recordStockOut({
    tenantId: user.tenantId,
    productId: data.productId,
    lotId: data.lotId,
    quantity: data.quantity,
    movementType: data.movementType,
    referenceDocument: data.referenceDocument,
    notes: data.notes,
    userId: user.id,
  });

  revalidatePath("/estoque");
  return result;
}

export async function createRemnantAction(data: {
  productId: string;
  warehouseId: string;
  parentLotId?: string;
  code?: string;
  thicknessMm: number;
  widthMm?: number;
  lengthMm?: number;
  diameterMm?: number;
  weightKg?: number;
  locationAddress: string;
  notes?: string;
}) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const remnant = await createRemnant({
    tenantId: user.tenantId,
    productId: data.productId,
    warehouseId: data.warehouseId,
    parentLotId: data.parentLotId,
    code: data.code,
    thicknessMm: data.thicknessMm,
    widthMm: data.widthMm,
    lengthMm: data.lengthMm,
    diameterMm: data.diameterMm,
    weightKg: data.weightKg,
    locationAddress: data.locationAddress,
    notes: data.notes,
    userId: user.id,
  });

  revalidatePath("/estoque");
  return remnant;
}

export async function reserveRemnantAction(remnantId: string, quoteId?: string) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await reserveRemnant(remnantId, user.tenantId, quoteId, user.id);
  revalidatePath("/estoque");
  return result;
}

export async function releaseRemnantAction(remnantId: string) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await releaseRemnant(remnantId, user.tenantId, user.id);
  revalidatePath("/estoque");
  return result;
}

export async function scrapRemnantAction(remnantId: string) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await scrapRemnant(remnantId, user.tenantId, user.id);
  revalidatePath("/estoque");
  return result;
}

export async function submitCycleCountAction(data: {
  lotId: string;
  countedQty: number;
  systemQty: number;
  justification?: string;
}) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await submitCycleCount({
    tenantId: user.tenantId,
    lotId: data.lotId,
    countedQty: data.countedQty,
    systemQty: data.systemQty,
    justification: data.justification,
    userId: user.id,
  });

  revalidatePath("/estoque");
  return result;
}

export async function importInitialStockAction(csvContent: string) {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const result = await importInitialStockCsv(csvContent, user.tenantId, user.id);
  revalidatePath("/estoque");
  return result;
}

export async function recalculateMetricsAction() {
  const user = await getCurrentUser();
  await requirePermission("estoque_retalhos", "write");

  const results = await recalculatePredictiveMetricsForTenant(user.tenantId);
  revalidatePath("/estoque");
  return { success: true, count: results.length };
}
