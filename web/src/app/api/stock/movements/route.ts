import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockMovements, products, stockLots, warehouses, users } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { and, desc, eq } from "drizzle-orm";
import { recordStockEntry, recordStockOut } from "@/lib/stock/movements";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const movements = await db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productSku: products.sku,
        productDescription: products.commercialDescription,
        lotId: stockMovements.lotId,
        lotNumber: stockLots.lotNumber,
        heatNumber: stockLots.heatNumber,
        warehouseId: stockMovements.warehouseId,
        warehouseName: warehouses.name,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        unitCost: stockMovements.unitCost,
        totalCost: stockMovements.totalCost,
        referenceDocument: stockMovements.referenceDocument,
        notes: stockMovements.notes,
        createdByName: users.name,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(stockLots, eq(stockMovements.lotId, stockLots.id))
      .innerJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .innerJoin(users, eq(stockMovements.createdBy, users.id))
      .where(eq(stockMovements.tenantId, user.tenantId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit);

    return NextResponse.json({ success: true, data: movements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    await requirePermission("estoque_retalhos", "write");

    const body = await req.json();

    if (body.type === "ENTRY" || body.movementType === "ENTRADA_COMPRA") {
      const result = await recordStockEntry({
        tenantId: user.tenantId,
        productId: body.productId,
        warehouseId: body.warehouseId,
        lotNumber: body.lotNumber,
        heatNumber: body.heatNumber,
        supplierId: body.supplierId,
        quantity: Number(body.quantity),
        unitCost: Number(body.unitCost),
        locationAddress: body.locationAddress,
        referenceDocument: body.referenceDocument,
        notes: body.notes,
        userId: user.id,
      });
      return NextResponse.json({ success: true, data: result });
    } else {
      const result = await recordStockOut({
        tenantId: user.tenantId,
        productId: body.productId,
        lotId: body.lotId,
        quantity: Number(body.quantity),
        movementType: body.movementType || "SAIDA_VENDA",
        referenceDocument: body.referenceDocument,
        notes: body.notes,
        userId: user.id,
      });
      return NextResponse.json({ success: true, data: result });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
