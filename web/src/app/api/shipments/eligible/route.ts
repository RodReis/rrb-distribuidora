import { NextResponse } from "next/server";
import { guardLogistics, logisticsErrorResponse } from "@/lib/logistics/api";
import { listEligibleOrders } from "@/lib/logistics/service";

export async function GET() {
  const guard = await guardLogistics("logistics.prepare");
  if (guard.error) return guard.error;
  try {
    return NextResponse.json({ data: await listEligibleOrders(guard.user.tenantId) });
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
