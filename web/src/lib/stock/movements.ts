import { db } from "@/lib/db";
import {
  products,
  stockLots,
  stockMovements,
  stockRemnants,
  auditLog,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { calculateRemnantWeight } from "./remnants-engine";
import { recalculatePredictiveMetricsForTenant } from "./predictive-engine";

export interface StockEntryInput {
  tenantId: string;
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
  userId: string;
}

export interface StockOutInput {
  tenantId: string;
  productId: string;
  lotId: string;
  quantity: number; // positive number requested to withdraw
  movementType?: "SAIDA_VENDA" | "CORTE_CONSUMO";
  referenceDocument?: string;
  notes?: string;
  userId: string;
}

export interface StockAdjustmentInput {
  tenantId: string;
  lotId: string;
  newQuantity: number;
  justification: string;
  userId: string;
}

export interface CreateRemnantInput {
  tenantId: string;
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
  userId: string;
}

/**
 * Registers an incoming purchase lot and stock movement
 */
export async function recordStockEntry(input: StockEntryInput) {
  if (input.quantity <= 0) {
    throw new Error("Quantidade de entrada deve ser maior que zero.");
  }
  if (input.unitCost < 0) {
    throw new Error("Custo unitário não pode ser negativo.");
  }

  const totalCost = Number((input.quantity * input.unitCost).toFixed(2));

  // Execute in transaction
  const result = await db.transaction(async (tx) => {
    // 1. Insert new stock lot
    const [lot] = await tx
      .insert(stockLots)
      .values({
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        lotNumber: input.lotNumber,
        heatNumber: input.heatNumber,
        supplierId: input.supplierId,
        quantityInitial: String(input.quantity),
        quantityCurrent: String(input.quantity),
        unitCost: String(input.unitCost),
        locationAddress: input.locationAddress || "Galpão Central",
        status: "ativo",
      })
      .returning();

    // 2. Insert stock movement
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        tenantId: input.tenantId,
        productId: input.productId,
        lotId: lot.id,
        warehouseId: input.warehouseId,
        movementType: "ENTRADA_COMPRA",
        quantity: String(input.quantity),
        unitCost: String(input.unitCost),
        totalCost: String(totalCost),
        referenceDocument: input.referenceDocument || `NF-e Entr ${input.lotNumber}`,
        notes: input.notes,
        createdBy: input.userId,
      })
      .returning();

    // 3. Update product replacement cost base with latest entry cost
    await tx
      .update(products)
      .set({
        replacementCostBase: String(input.unitCost),
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.productId));

    // 4. Audit log
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_lots",
      entityId: lot.id,
      action: "insert",
      after: {
        lotNumber: lot.lotNumber,
        heatNumber: lot.heatNumber,
        quantity: input.quantity,
        unitCost: input.unitCost,
      },
    });

    return { lot, movement };
  });

  // Recalculate metrics asynchronously
  try {
    await recalculatePredictiveMetricsForTenant(input.tenantId);
  } catch (e) {
    console.error("Erro ao atualizar métricas preditivas pós entrada:", e);
  }

  return result;
}

/**
 * Registers an outgoing stock movement (Sale or Cutting consumption) with strict negative stock prevention
 */
export async function recordStockOut(input: StockOutInput) {
  if (input.quantity <= 0) {
    throw new Error("Quantidade de saída deve ser maior que zero.");
  }

  const result = await db.transaction(async (tx) => {
    // 1. Fetch current lot with lock
    const [lot] = await tx
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.id, input.lotId), eq(stockLots.tenantId, input.tenantId)))
      .limit(1);

    if (!lot) {
      throw new Error("Lote de estoque não encontrado.");
    }

    if (lot.status !== "ativo") {
      throw new Error(`Lote encontra-se ${lot.status}. Não é permitida movimentação.`);
    }

    const currentQty = Number(lot.quantityCurrent);
    if (currentQty < input.quantity) {
      throw new Error(
        `Saldo insuficiente no lote ${lot.lotNumber}. Disponível: ${currentQty}, Solicitado: ${input.quantity}. Bloqueio de saldo negativo ativo.`
      );
    }

    const remainingQty = Number((currentQty - input.quantity).toFixed(4));
    const newStatus = remainingQty === 0 ? "esgotado" : "ativo";
    const unitCost = Number(lot.unitCost);
    const totalCost = Number((input.quantity * unitCost).toFixed(2));

    // 2. Decrement lot balance
    await tx
      .update(stockLots)
      .set({
        quantityCurrent: String(remainingQty),
        status: newStatus,
      })
      .where(eq(stockLots.id, lot.id));

    // 3. Register movement (quantity is negative for outgoing)
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        tenantId: input.tenantId,
        productId: lot.productId,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        movementType: input.movementType || "SAIDA_VENDA",
        quantity: String(-input.quantity),
        unitCost: String(unitCost),
        totalCost: String(totalCost),
        referenceDocument: input.referenceDocument,
        notes: input.notes,
        createdBy: input.userId,
      })
      .returning();

    // 4. Audit
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_lots",
      entityId: lot.id,
      action: "update",
      before: { quantityCurrent: currentQty },
      after: { quantityCurrent: remainingQty, status: newStatus },
    });

    return { movement, remainingQty, newStatus };
  });

  try {
    await recalculatePredictiveMetricsForTenant(input.tenantId);
  } catch (e) {
    console.error("Erro ao atualizar métricas preditivas pós saída:", e);
  }

  return result;
}

/**
 * Registers an inventory adjustment with mandatory justification
 */
export async function recordStockAdjustment(input: StockAdjustmentInput) {
  if (!input.justification || input.justification.trim().length < 5) {
    throw new Error("Justificativa obrigatória (mínimo 5 caracteres) para ajuste de inventário.");
  }
  if (input.newQuantity < 0) {
    throw new Error("Nova quantidade não pode ser negativa.");
  }

  const result = await db.transaction(async (tx) => {
    const [lot] = await tx
      .select()
      .from(stockLots)
      .where(and(eq(stockLots.id, input.lotId), eq(stockLots.tenantId, input.tenantId)))
      .limit(1);

    if (!lot) throw new Error("Lote não encontrado.");

    const oldQty = Number(lot.quantityCurrent);
    const diff = Number((input.newQuantity - oldQty).toFixed(4));

    if (diff === 0) {
      return { lot, diff: 0 };
    }

    const unitCost = Number(lot.unitCost);
    const totalCost = Number((Math.abs(diff) * unitCost).toFixed(2));
    const newStatus = input.newQuantity === 0 ? "esgotado" : "ativo";

    // Update lot
    await tx
      .update(stockLots)
      .set({
        quantityCurrent: String(input.newQuantity),
        status: newStatus,
      })
      .where(eq(stockLots.id, lot.id));

    // Register movement
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        tenantId: input.tenantId,
        productId: lot.productId,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        movementType: "AJUSTE_INVENTARIO",
        quantity: String(diff), // positive if surplus, negative if loss
        unitCost: String(unitCost),
        totalCost: String(totalCost),
        referenceDocument: "Ajuste Inventário Cíclico",
        notes: `Ajuste de ${oldQty} para ${input.newQuantity}. Motivo: ${input.justification}`,
        createdBy: input.userId,
      })
      .returning();

    // Audit log
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_lots",
      entityId: lot.id,
      action: "update",
      before: { quantityCurrent: oldQty },
      after: {
        quantityCurrent: input.newQuantity,
        justification: input.justification,
      },
    });

    return { movement, lot, diff };
  });

  try {
    await recalculatePredictiveMetricsForTenant(input.tenantId);
  } catch (e) {
    console.error("Erro ao atualizar métricas preditivas pós ajuste:", e);
  }

  return result;
}

/**
 * Creates a cataloged remnant (offcut)
 */
export async function createRemnant(input: CreateRemnantInput) {
  // Generate code if not provided: RET-XXXXX
  const code =
    input.code ||
    `RET-${Math.floor(1000 + Math.random() * 9000)}`;

  // Find product to determine density for automatic weight calculation
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product) throw new Error("Produto não encontrado.");

  let weightKg = input.weightKg;
  if (!weightKg || weightKg <= 0) {
    weightKg = calculateRemnantWeight({
      family: product.family,
      norm: product.norm,
      densityGCm3: Number(product.densityGCm3),
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      diameterMm: input.diameterMm,
    });
  }

  const [remnant] = await db
    .insert(stockRemnants)
    .values({
      tenantId: input.tenantId,
      code,
      productId: input.productId,
      warehouseId: input.warehouseId,
      parentLotId: input.parentLotId,
      thicknessMm: String(input.thicknessMm),
      widthMm: input.widthMm ? String(input.widthMm) : null,
      lengthMm: input.lengthMm ? String(input.lengthMm) : null,
      diameterMm: input.diameterMm ? String(input.diameterMm) : null,
      weightKg: String(weightKg),
      locationAddress: input.locationAddress,
      status: "disponivel",
      notes: input.notes,
    })
    .returning();

  // Audit
  await db.insert(auditLog).values({
    tenantId: input.tenantId,
    userId: input.userId,
    entity: "stock_remnants",
    entityId: remnant.id,
    action: "insert",
    after: {
      code: remnant.code,
      weightKg,
      dimensions: `${input.thicknessMm}x${input.widthMm}x${input.lengthMm}mm`,
    },
  });

  return remnant;
}

/**
 * Reserves a remnant for a quote or order
 */
export async function reserveRemnant(
  remnantId: string,
  tenantId: string,
  quoteId?: string,
  userId?: string
) {
  const [remnant] = await db
    .select()
    .from(stockRemnants)
    .where(and(eq(stockRemnants.id, remnantId), eq(stockRemnants.tenantId, tenantId)))
    .limit(1);

  if (!remnant) throw new Error("Retalho não encontrado.");
  if (remnant.status !== "disponivel") {
    throw new Error(`Retalho não está disponível (Status atual: ${remnant.status}).`);
  }

  const [updated] = await db
    .update(stockRemnants)
    .set({
      status: "reservado",
      reservedForQuoteId: quoteId || null,
      updatedAt: new Date(),
    })
    .where(eq(stockRemnants.id, remnantId))
    .returning();

  if (userId) {
    await db.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_remnants",
      entityId: remnantId,
      action: "update",
      before: { status: "disponivel" },
      after: { status: "reservado", quoteId },
    });
  }

  return updated;
}

/**
 * Releases a reserved remnant back to available
 */
export async function releaseRemnant(remnantId: string, tenantId: string, userId?: string) {
  const [updated] = await db
    .update(stockRemnants)
    .set({
      status: "disponivel",
      reservedForQuoteId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(stockRemnants.id, remnantId), eq(stockRemnants.tenantId, tenantId)))
    .returning();

  if (userId) {
    await db.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_remnants",
      entityId: remnantId,
      action: "update",
      before: { status: "reservado" },
      after: { status: "disponivel" },
    });
  }

  return updated;
}

/**
 * Marks a remnant as scrapped (descarte/sucata)
 */
export async function scrapRemnant(remnantId: string, tenantId: string, userId?: string) {
  const [updated] = await db
    .update(stockRemnants)
    .set({
      status: "descarte",
      updatedAt: new Date(),
    })
    .where(and(eq(stockRemnants.id, remnantId), eq(stockRemnants.tenantId, tenantId)))
    .returning();

  if (userId) {
    await db.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_remnants",
      entityId: remnantId,
      action: "update",
      after: { status: "descarte" },
    });
  }

  return updated;
}
