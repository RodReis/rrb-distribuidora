import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockLots, products, suppliers, warehouses } from "@/lib/db/schema";
import { guardStock } from "@/lib/stock/api-auth";
import { and, desc, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const guard = await guardStock("read");
    if (guard.error) return guard.error;
    const user = guard.user;
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const status = searchParams.get("status") || "todos";

    const conditions = [eq(stockLots.tenantId, user.tenantId)];
    if (productId) {
      conditions.push(eq(stockLots.productId, productId));
    }
    if (status !== "todos") {
      conditions.push(eq(stockLots.status, status));
    }

    const lots = await db
      .select({
        id: stockLots.id,
        lotNumber: stockLots.lotNumber,
        heatNumber: stockLots.heatNumber,
        productId: stockLots.productId,
        productSku: products.sku,
        productDescription: products.commercialDescription,
        productNorm: products.norm,
        supplierId: stockLots.supplierId,
        supplierName: suppliers.tradeName,
        warehouseId: stockLots.warehouseId,
        warehouseName: warehouses.name,
        quantityInitial: stockLots.quantityInitial,
        quantityCurrent: stockLots.quantityCurrent,
        unitCost: stockLots.unitCost,
        locationAddress: stockLots.locationAddress,
        entryDate: stockLots.entryDate,
        status: stockLots.status,
        createdAt: stockLots.createdAt,
      })
      .from(stockLots)
      .innerJoin(products, eq(stockLots.productId, products.id))
      .innerJoin(warehouses, eq(stockLots.warehouseId, warehouses.id))
      .leftJoin(suppliers, eq(stockLots.supplierId, suppliers.id))
      .where(and(...conditions))
      .orderBy(desc(stockLots.createdAt));

    return NextResponse.json({ success: true, data: lots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
