import { NextResponse } from "next/server";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { getProductionReports, submitProductionReport } from "@/lib/production/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardProduction("production.read");
  if (guard.error) return guard.error;
  try {
    const { id } = await params;
    const data = await getProductionReports(guard.user.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return productionErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardProduction("production.report", { requireStockWrite: true });
  if (guard.error) return guard.error;
  try {
    const { id } = await params;
    const result = await submitProductionReport({
      tenantId: guard.user.tenantId,
      orderId: id,
      user: guard.user,
      payload: await request.json(),
    });
    return NextResponse.json({ success: true, data: result.report, replayed: result.replayed ?? false });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
