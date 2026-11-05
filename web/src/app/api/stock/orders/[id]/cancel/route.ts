import { NextResponse } from "next/server";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { cancelSalesOrder } from "@/lib/stock/reservations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardProduction("production.close");
  if (guard.error) return guard.error;
  try {
    const body = await req.json();
    if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
      return NextResponse.json(
        { error: "Justificativa do cancelamento deve ter ao menos 5 caracteres." },
        { status: 422 }
      );
    }
    const { id } = await params;
    const result = await cancelSalesOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      orderId: id,
      reason: body.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return productionErrorResponse(error);
  }
}
