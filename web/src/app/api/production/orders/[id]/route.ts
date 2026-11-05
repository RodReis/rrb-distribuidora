import { NextResponse } from "next/server";
import { getProductionOrderDetails } from "@/lib/production/service";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { ProductionError } from "@/lib/production/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardProduction("production.read");
  if (guard.error) return guard.error;
  try {
    const { id } = await params;
    const data = await getProductionOrderDetails(guard.user.tenantId, id);
    if (!data) throw new ProductionError("Ordem de produção não encontrada neste tenant.", 404);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
