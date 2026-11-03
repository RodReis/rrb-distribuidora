import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { registerPurchaseReceipt } from "@/lib/purchases/receipts";
import { purchaseReceiptSchema } from "@/lib/purchases/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/purchases/[id]/receipts — recebe (parcial ou total) contra um item de PC emitido.
 *
 * Exige `stock.receive_purchase`. O corpo é o `purchaseReceiptSchema`; a chave de
 * idempotência vem do header `Idempotency-Key` (preferido) ou do campo `idempotencyKey`.
 * Repetição devolve o MESMO recebimento, sem duplicar lote/movimento (201).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardPurchase("stock.receive_purchase");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no recebimento.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const idempotencyKey = idempotencyKeyFrom(req, parsed.data);
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          error:
            "Envie a chave de idempotência (header Idempotency-Key ou campo idempotencyKey) para receber.",
        },
        { status: 422 }
      );
    }

    const { receipt } = await registerPurchaseReceipt({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      purchaseOrderId: id,
      input: { ...parsed.data, idempotencyKey },
    });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
