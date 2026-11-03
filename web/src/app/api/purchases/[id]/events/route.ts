import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { purchaseFollowUpSchema } from "@/lib/purchases/schemas";
import { addPurchaseFollowUp } from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/** POST /api/purchases/[id]/events — follow-up manual (timeline; não envia nada automaticamente). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase("purchase.follow_up");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseFollowUpSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no follow-up.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await addPurchaseFollowUp({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      type: parsed.data.type,
      note: parsed.data.note,
      expectedDeliveryAt: parsed.data.expectedDeliveryAt ?? null,
      idempotencyKey: idempotencyKeyFrom(req, parsed.data) || null,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
