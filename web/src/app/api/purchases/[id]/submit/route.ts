import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { submitPurchaseSchema } from "@/lib/purchases/schemas";
import { submitPurchaseOrder } from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/** POST /api/purchases/[id]/submit — congela versão/hash e resolve a alçada. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase("purchase.submit");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = submitPurchaseSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await submitPurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      idempotencyKey: idempotencyKeyFrom(req, parsed.data) || null,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
