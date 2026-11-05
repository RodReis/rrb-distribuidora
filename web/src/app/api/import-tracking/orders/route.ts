import { NextResponse } from "next/server";
import { guardLogistics, logisticsErrorResponse } from "@/lib/logistics/api";
import { listImportOrders } from "@/lib/logistics/service";

export async function GET() {
  const guard = await guardLogistics("logistics.track");
  if (guard.error) return guard.error;
  try {
    return NextResponse.json({ data: await listImportOrders(guard.user.tenantId) });
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
