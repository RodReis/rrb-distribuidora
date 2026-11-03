import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { purchaseDecisionSchema } from "@/lib/purchases/schemas";
import { decidePurchaseOrder } from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/purchases/[id]/decision — aprova ou rejeita a versão submetida.
 * O serviço revalida hash, faixa de alçada, segregação e quantidade de aprovadores.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase(["purchase.approve", "purchase.reject"]);
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseDecisionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos na decisão.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await decidePurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      decision: parsed.data.decision,
      justification: parsed.data.justification ?? null,
      idempotencyKey: idempotencyKeyFrom(req, parsed.data) || null,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
