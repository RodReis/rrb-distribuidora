import { NextResponse } from "next/server";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { ProductionError } from "@/lib/production/errors";
import { applyApprovedProductionReport } from "@/lib/production/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const guard = await guardProduction("production.report", { requireStockWrite: true });
  if (guard.error) return guard.error;
  try {
    const { id: orderId, reportId } = await params;
    const result = await applyApprovedProductionReport({
      tenantId: guard.user.tenantId,
      orderId,
      reportId,
      user: guard.user,
    });
    if (result.report.orderId !== orderId) {
      throw new ProductionError("Apontamento não pertence à ordem informada.", 404);
    }
    return NextResponse.json({ success: true, data: result.report });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
