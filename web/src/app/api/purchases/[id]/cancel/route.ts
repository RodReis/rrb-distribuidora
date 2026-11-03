import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { purchaseCancelSchema } from "@/lib/purchases/schemas";
import { cancelPurchaseOrder } from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/** POST /api/purchases/[id]/cancel — cancela com justificativa, preservando todo o histórico. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase("purchase.cancel");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseCancelSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no cancelamento.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await cancelPurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      reason: parsed.data.reason,
      idempotencyKey: idempotencyKeyFrom(req, parsed.data) || null,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
