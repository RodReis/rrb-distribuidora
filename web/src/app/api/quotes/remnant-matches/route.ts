import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockLots, stockRemnants, warehouses } from "@/lib/db/schema";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { findMatchingRemnants } from "@/lib/stock/remnants-engine";

/**
 * Busca retalhos compatíveis com a geometria do item (MVP-02).
 *
 * A rota é guardada por `vendas_orcamentos` para que o vendedor consulte
 * retalhos sem precisar de escrita no módulo de estoque.
 */
export async function GET(req: Request) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  try {
    const { searchParams } = new URL(req.url);
    const geometryType = searchParams.get("geometryType") ?? "CHAPA_RETANGULAR";
    const thicknessMm = Number(searchParams.get("thicknessMm") ?? 0);
    const widthMm = Number(searchParams.get("widthMm") ?? 0);
    const lengthMm = Number(searchParams.get("lengthMm") ?? 0);
    const diameterMm = Number(searchParams.get("diameterMm") ?? 0);
    const productId = searchParams.get("productId");

    if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
      return NextResponse.json({ matches: [] });
    }

    const conditions = [
      eq(stockRemnants.tenantId, guard.user.tenantId),
      eq(stockRemnants.status, "disponivel"),
    ];
    if (productId) conditions.push(eq(stockRemnants.productId, productId));

    const rows = await db
      .select({
        id: stockRemnants.id,
        code: stockRemnants.code,
        productId: stockRemnants.productId,
        productSku: products.sku,
        productDescription: products.commercialDescription,
        productNorm: products.norm,
        productFamily: products.family,
        warehouseName: warehouses.name,
        parentHeatNumber: stockLots.heatNumber,
        thicknessMm: stockRemnants.thicknessMm,
        widthMm: stockRemnants.widthMm,
        lengthMm: stockRemnants.lengthMm,
        diameterMm: stockRemnants.diameterMm,
        weightKg: stockRemnants.weightKg,
        locationAddress: stockRemnants.locationAddress,
        status: stockRemnants.status,
        createdAt: stockRemnants.createdAt,
      })
      .from(stockRemnants)
      .innerJoin(products, eq(stockRemnants.productId, products.id))
      .innerJoin(warehouses, eq(stockRemnants.warehouseId, warehouses.id))
      .leftJoin(stockLots, eq(stockRemnants.parentLotId, stockLots.id))
      .where(and(...conditions))
      .orderBy(desc(stockRemnants.weightKg))
      .limit(200);

    const normalized = rows.map((row) => ({
      ...row,
      thicknessMm: Number(row.thicknessMm),
      widthMm: row.widthMm == null ? null : Number(row.widthMm),
      lengthMm: row.lengthMm == null ? null : Number(row.lengthMm),
      diameterMm: row.diameterMm == null ? null : Number(row.diameterMm),
      weightKg: Number(row.weightKg),
    }));

    const criteria = buildCriteria(geometryType, {
      thicknessMm,
      widthMm,
      lengthMm,
      diameterMm,
    });

    const matches = findMatchingRemnants(normalized, criteria)
      .filter((match) => match.fits)
      .slice(0, 12);

    return NextResponse.json({ matches });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}

function buildCriteria(
  geometryType: string,
  dims: { thicknessMm: number; widthMm: number; lengthMm: number; diameterMm: number }
) {
  switch (geometryType) {
    case "CHAPA_RETANGULAR":
      return {
        thicknessMm: dims.thicknessMm,
        minWidthMm: dims.widthMm,
        minLengthMm: dims.lengthMm,
      };
    case "DISCO":
      // O retalho de chapa precisa conter o disco: usa o diâmetro como lado.
      return dims.diameterMm > 0
        ? {
            thicknessMm: dims.thicknessMm,
            minWidthMm: dims.diameterMm,
            minLengthMm: dims.diameterMm,
          }
        : { thicknessMm: dims.thicknessMm };
    case "BARRA_CORTE":
    case "TUBO_CORTE":
      return {
        thicknessMm: dims.thicknessMm,
        minDiameterMm: dims.diameterMm,
        minLengthMm: dims.lengthMm,
      };
    default:
      return { thicknessMm: dims.thicknessMm };
  }
}
