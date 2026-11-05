import { NextResponse } from "next/server";
import { guardStock, stockErrorResponse } from "@/lib/stock/api-auth";
import { reserveStock, releaseStockReservation } from "@/lib/stock/reservations";
import { db } from "@/lib/db";
import {
  stockReservations,
  products,
  warehouses,
  salesOrders,
  customers,
  quotes,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

const createReservationSchema = z.object({
  sourceType: z.string().trim().min(1).max(30),
  sourceId: z.string().uuid(),
  lotId: z.string().uuid(),
  quantity: z.number().finite().positive(),
});
const releaseReservationSchema = z.object({ reservationId: z.string().uuid() });

export async function GET() {
  const guard = await guardStock("read");
  if (guard.error) return guard.error;
  const data = await db
    .select({
      id: stockReservations.id,
      sourceType: stockReservations.sourceType,
      sourceId: stockReservations.sourceId,
      productId: stockReservations.productId,
      sku: products.sku,
      description: products.commercialDescription,
      lotId: stockReservations.lotId,
      warehouseId: stockReservations.warehouseId,
      warehouseName: warehouses.name,
      quantity: stockReservations.quantity,
      status: stockReservations.status,
      createdAt: stockReservations.createdAt,
    })
    .from(stockReservations)
    .innerJoin(products, eq(products.id, stockReservations.productId))
    .innerJoin(warehouses, eq(warehouses.id, stockReservations.warehouseId))
    .where(eq(stockReservations.tenantId, guard.user.tenantId))
    .orderBy(desc(stockReservations.createdAt));
  const orders = await db
    .select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      customerName: customers.tradeName,
      createdAt: salesOrders.createdAt,
    })
    .from(salesOrders)
    .innerJoin(quotes, eq(quotes.id, salesOrders.quoteId))
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .where(
      and(
        eq(salesOrders.tenantId, guard.user.tenantId),
        eq(quotes.status, "aprovado"),
        inArray(salesOrders.orderStatus, ["aguardando_producao", "em_corte"])
      )
    );
  return NextResponse.json({ data, orders });
}

export async function POST(request: Request) {
  const guard = await guardStock("write");
  if (guard.error) return guard.error;
  try {
    const body = createReservationSchema.parse(await request.json());
    const item = await reserveStock({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      lotId: body.lotId,
      quantity: body.quantity,
    });
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return stockErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const guard = await guardStock("write");
  if (guard.error) return guard.error;
  try {
    const body = releaseReservationSchema.parse(await request.json());
    const item = await releaseStockReservation({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      reservationId: body.reservationId,
    });
    return NextResponse.json({ data: item });
  } catch (error) {
    return stockErrorResponse(error);
  }
}
