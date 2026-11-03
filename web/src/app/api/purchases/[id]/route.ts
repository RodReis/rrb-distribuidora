import { NextResponse } from "next/server";
import { guardPurchase, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { purchaseOrderInputSchema } from "@/lib/purchases/schemas";
import {
  deletePurchaseDraft,
  getPurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/purchases/[id] — detalhe completo (itens, versões, aprovações, eventos, recebimentos). */
export async function GET(_req: Request, { params }: Params) {
  const guard = await guardPurchase("purchase.read");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const order = await getPurchaseOrder({
      tenantId: guard.user.tenantId,
      role: guard.user.role,
      userId: guard.user.id,
      id,
    });
    if (!order) {
      return NextResponse.json({ error: "Pedido de compra não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}

/** PATCH /api/purchases/[id] — edita o conteúdo (invalida aprovação anterior). */
export async function PATCH(req: Request, { params }: Params) {
  const guard = await guardPurchase("purchase.edit");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = purchaseOrderInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no pedido.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await updatePurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
      payload: parsed.data,
    });

    return NextResponse.json({ order });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}

/** DELETE /api/purchases/[id] — exclusão lógica de rascunho. */
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await guardPurchase("purchase.edit");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    await deletePurchaseDraft({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
