import { NextResponse } from "next/server";
import { guardPurchase, idempotencyKeyFrom, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { reversePurchaseReceipt } from "@/lib/purchases/receipts";
import { purchaseReverseReceiptSchema } from "@/lib/purchases/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/purchases/receipts/[receiptId]/reverse — estorna um recebimento.
 *
 * Exige `stock.receive_purchase` e justificativa (mínimo 5 caracteres). Não apaga nada:
 * marca o recebimento e cria o movimento compensatório `ESTORNO_COMPRA`. Repetição com
 * a mesma chave devolve o mesmo resultado, sem segundo movimento.
 */
export async function POST(req: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const guard = await guardPurchase("stock.receive_purchase");
  if (guard.error) return guard.error;

  try {
    const { receiptId } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseReverseReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no estorno.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const idempotencyKey = idempotencyKeyFrom(req, parsed.data);
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          error:
            "Envie a chave de idempotência (header Idempotency-Key ou campo idempotencyKey) para estornar.",
        },
        { status: 422 }
      );
    }

    const { receipt } = await reversePurchaseReceipt({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      receiptId,
      reason: parsed.data.reason,
      idempotencyKey,
    });

    return NextResponse.json({ receipt });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
