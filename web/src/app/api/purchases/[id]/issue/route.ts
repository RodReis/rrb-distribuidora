import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { issuePurchaseSchema } from "@/lib/purchases/schemas";
import { issuePurchaseOrder } from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/purchases/[id]/issue — emite o pedido aprovado.
 * Revalida hash/versão aprovada e matriz de alçadas; repetição com a mesma
 * chave devolve o mesmo PC, sem gerar segundo número.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase("purchase.issue");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = issuePurchaseSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Envie a chave de idempotência (header Idempotency-Key ou campo idempotencyKey) para emitir.",
          issues: parsed.error.flatten(),
        },
        { status: 422 }
      );
    }

    const order = await issuePurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      idempotencyKey: idempotencyKeyFrom(req, parsed.data),
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
