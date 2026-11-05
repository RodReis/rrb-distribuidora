import { db } from "@/lib/db";
import {
  auditLog,
  stockLots,
  stockMovements,
  stockReservations,
  stockTransferItems,
  stockTransfers,
  warehouses,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export class StockTransferError extends Error {}

export async function transferStock(input: {
  tenantId: string;
  userId: string;
  requestKey: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ lotId: string; quantity: number }>;
}) {
  if (input.fromWarehouseId === input.toWarehouseId || input.items.length === 0) {
    throw new StockTransferError("Informe depósitos diferentes e ao menos um lote.");
  }
  if (input.items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new StockTransferError("Toda quantidade transferida deve ser positiva.");
  }
  const grouped = new Map<string, number>();
  for (const item of input.items)
    grouped.set(item.lotId, (grouped.get(item.lotId) ?? 0) + item.quantity);

  return db.transaction(async (tx) => {
    const [prior] = await tx
      .select()
      .from(stockTransfers)
      .where(
        and(
          eq(stockTransfers.tenantId, input.tenantId),
          eq(stockTransfers.requestKey, input.requestKey)
        )
      );
    if (prior) return prior;

    const warehousesInTenant = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, input.tenantId),
          eq(warehouses.active, true),
          inArray(warehouses.id, [input.fromWarehouseId, input.toWarehouseId])
        )
      );
    if (warehousesInTenant.length !== 2)
      throw new StockTransferError("Depósito ativo não encontrado neste tenant.");

    const lotIds = [...grouped.keys()].sort();
    const lots = await tx
      .select()
      .from(stockLots)
      .where(
        and(
          eq(stockLots.tenantId, input.tenantId),
          inArray(stockLots.id, lotIds),
          eq(stockLots.warehouseId, input.fromWarehouseId),
          eq(stockLots.status, "ativo")
        )
      )
      .orderBy(stockLots.id)
      .for("update");
    if (lots.length !== lotIds.length)
      throw new StockTransferError("Lote ativo não encontrado no depósito de origem.");

    // Per-lot aggregation ensures reserved units cannot be transferred.
    const reservedByLot = await tx
      .select({
        lotId: stockReservations.lotId,
        quantity: sql<string>`coalesce(sum(${stockReservations.quantity} - ${stockReservations.consumedQuantity}), 0)`,
      })
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.tenantId, input.tenantId),
          inArray(stockReservations.lotId, lotIds),
          eq(stockReservations.status, "ativa")
        )
      )
      .groupBy(stockReservations.lotId);
    const reservedLookup = new Map(reservedByLot.map((row) => [row.lotId, Number(row.quantity)]));
    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        tenantId: input.tenantId,
        requestKey: input.requestKey,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        createdBy: input.userId,
        status: "concluida",
      })
      .returning();

    for (const lot of lots) {
      const quantity = grouped.get(lot.id)!;
      const available = Number(lot.quantityCurrent) - (reservedLookup.get(lot.id) ?? 0);
      if (quantity > available)
        throw new StockTransferError(`Saldo disponível insuficiente no lote ${lot.lotNumber}.`);
      const remaining = Number((Number(lot.quantityCurrent) - quantity).toFixed(4));
      const [destinationLot] = await tx
        .insert(stockLots)
        .values({
          tenantId: input.tenantId,
          productId: lot.productId,
          warehouseId: input.toWarehouseId,
          lotNumber: lot.lotNumber,
          heatNumber: lot.heatNumber,
          supplierId: lot.supplierId,
          quantityInitial: String(quantity),
          quantityCurrent: String(quantity),
          unitCost: lot.unitCost,
          locationAddress: null,
          status: "ativo",
        })
        .returning();
      await tx
        .update(stockLots)
        .set({ quantityCurrent: String(remaining), status: remaining === 0 ? "esgotado" : "ativo" })
        .where(eq(stockLots.id, lot.id));
      const totalCost = Number((quantity * Number(lot.unitCost)).toFixed(2));
      await tx.insert(stockMovements).values([
        {
          tenantId: input.tenantId,
          productId: lot.productId,
          lotId: lot.id,
          warehouseId: input.fromWarehouseId,
          movementType: "TRANSFERENCIA_SAIDA",
          quantity: String(-quantity),
          unitCost: lot.unitCost,
          totalCost: String(totalCost),
          referenceDocument: `TRF-${transfer.number}`,
          notes: "Transferência atômica entre depósitos",
          createdBy: input.userId,
        },
        {
          tenantId: input.tenantId,
          productId: lot.productId,
          lotId: destinationLot.id,
          warehouseId: input.toWarehouseId,
          movementType: "TRANSFERENCIA_ENTRADA",
          quantity: String(quantity),
          unitCost: lot.unitCost,
          totalCost: String(totalCost),
          referenceDocument: `TRF-${transfer.number}`,
          notes: "Transferência atômica entre depósitos",
          createdBy: input.userId,
        },
      ]);
      await tx.insert(stockTransferItems).values({
        transferId: transfer.id,
        sourceLotId: lot.id,
        destinationLotId: destinationLot.id,
        quantity: String(quantity),
      });
    }
    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "stock_transfers",
      entityId: transfer.id,
      action: "insert",
      before: null,
      after: { ...transfer, itemCount: lots.length },
    });
    return transfer;
  });
}
