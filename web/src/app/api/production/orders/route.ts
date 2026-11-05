import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createProductionOrderForSalesOrder, getProductionOrders } from "@/lib/production/service";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { ProductionError } from "@/lib/production/errors";
import { z } from "zod";

const createOrderSchema = z.object({ salesOrderId: z.string().uuid() });

export async function GET() {
  const guard = await guardProduction("production.read");
  if (guard.error) return guard.error;
  try {
    const data = await getProductionOrders(guard.user.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardProduction("production.read");
  if (guard.error) return guard.error;
  try {
    const parsed = createOrderSchema.safeParse(await request.json());
    if (!parsed.success) throw new ProductionError("Informe um pedido de venda válido.");
    if (!guard.user || !["admin", "diretor"].includes(guard.user.role)) {
      throw new ProductionError("Somente admin ou diretor pode criar uma ordem de produção.", 403);
    }
    const data = await db.transaction((tx) =>
      createProductionOrderForSalesOrder(tx, {
        tenantId: guard.user.tenantId,
        salesOrderId: parsed.data.salesOrderId,
        createdBy: guard.user.id,
      })
    );
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
