import { NextResponse } from "next/server";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { transitionProductionOrder } from "@/lib/production/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardProduction("production.read");
  if (guard.error) return guard.error;
  try {
    const { id } = await params;
    const data = await transitionProductionOrder({
      tenantId: guard.user.tenantId,
      orderId: id,
      user: guard.user,
      payload: await request.json(),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
