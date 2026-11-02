import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockRemnants, products, warehouses, stockLots } from "@/lib/db/schema";
import { guardStock } from "@/lib/stock/api-auth";
import { and, desc, eq } from "drizzle-orm";
import { createRemnant } from "@/lib/stock/movements";
import { findMatchingRemnants } from "@/lib/stock/remnants-engine";

export async function GET(req: Request) {
  try {
    const guard = await guardStock("read");
    if (guard.error) return guard.error;
    const user = guard.user;
    const { searchParams } = new URL(req.url);

    // Dimensional search parameters
    const thickness = searchParams.get("thickness");
    const minWidth = searchParams.get("minWidth");
    const minLength = searchParams.get("minLength");
    const minDiameter = searchParams.get("minDiameter");
    const status = searchParams.get("status") || "todos";

    const conditions = [eq(stockRemnants.tenantId, user.tenantId)];
    if (status !== "todos") {
      conditions.push(eq(stockRemnants.status, status));
    }

    const remnants = await db
      .select({
        id: stockRemnants.id,
        code: stockRemnants.code,
        productId: stockRemnants.productId,
        productSku: products.sku,
        productDescription: products.commercialDescription,
        productNorm: products.norm,
        productFamily: products.family,
        warehouseId: stockRemnants.warehouseId,
        warehouseName: warehouses.name,
        parentLotId: stockRemnants.parentLotId,
        parentHeatNumber: stockLots.heatNumber,
        thicknessMm: stockRemnants.thicknessMm,
        widthMm: stockRemnants.widthMm,
        lengthMm: stockRemnants.lengthMm,
        diameterMm: stockRemnants.diameterMm,
        weightKg: stockRemnants.weightKg,
        locationAddress: stockRemnants.locationAddress,
        status: stockRemnants.status,
        reservedForQuoteId: stockRemnants.reservedForQuoteId,
        notes: stockRemnants.notes,
        createdAt: stockRemnants.createdAt,
      })
      .from(stockRemnants)
      .innerJoin(products, eq(stockRemnants.productId, products.id))
      .innerJoin(warehouses, eq(stockRemnants.warehouseId, warehouses.id))
      .leftJoin(stockLots, eq(stockRemnants.parentLotId, stockLots.id))
      .where(and(...conditions))
      .orderBy(desc(stockRemnants.createdAt));

    // If dimensional criteria is provided, run dimensional matching
    if (thickness && (minWidth || minLength || minDiameter)) {
      const criteria = {
        thicknessMm: parseFloat(thickness),
        minWidthMm: minWidth ? parseFloat(minWidth) : undefined,
        minLengthMm: minLength ? parseFloat(minLength) : undefined,
        minDiameterMm: minDiameter ? parseFloat(minDiameter) : undefined,
      };

      const matches = findMatchingRemnants(remnants, criteria);
      return NextResponse.json({ success: true, isSearch: true, matches });
    }

    return NextResponse.json({ success: true, isSearch: false, data: remnants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await guardStock("write");
    if (guard.error) return guard.error;
    const user = guard.user;

    const body = await req.json();

    const remnant = await createRemnant({
      tenantId: user.tenantId,
      productId: body.productId,
      warehouseId: body.warehouseId,
      parentLotId: body.parentLotId,
      code: body.code,
      thicknessMm: Number(body.thicknessMm),
      widthMm: body.widthMm ? Number(body.widthMm) : undefined,
      lengthMm: body.lengthMm ? Number(body.lengthMm) : undefined,
      diameterMm: body.diameterMm ? Number(body.diameterMm) : undefined,
      weightKg: body.weightKg ? Number(body.weightKg) : undefined,
      locationAddress: body.locationAddress || "Galpão Central",
      notes: body.notes,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: remnant });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
