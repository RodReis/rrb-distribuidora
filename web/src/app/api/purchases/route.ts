import { NextResponse } from "next/server";
import { guardPurchase, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { purchaseOrderInputSchema } from "@/lib/purchases/schemas";
import {
  createPurchaseOrder,
  getPurchaseSummary,
  listPurchaseOrders,
} from "@/lib/purchases/service";

export const dynamic = "force-dynamic";

/** GET /api/purchases — lista filtrada + KPIs do módulo. */
export async function GET(req: Request) {
  const guard = await guardPurchase("purchase.read");
  if (guard.error) return guard.error;

  try {
    const url = new URL(req.url);
    const filters = {
      status: url.searchParams.get("status") ?? undefined,
      supplierId: url.searchParams.get("supplierId") ?? undefined,
      search: url.searchParams.get("q") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 20),
    };

    const [list, summary] = await Promise.all([
      listPurchaseOrders({
        tenantId: guard.user.tenantId,
        role: guard.user.role,
        userId: guard.user.id,
        filters,
      }),
      getPurchaseSummary({
        tenantId: guard.user.tenantId,
        role: guard.user.role,
        userId: guard.user.id,
      }),
    ]);

    return NextResponse.json({ ...list, summary });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}

/** POST /api/purchases — cria rascunho (nunca emite, nunca reserva estoque). */
export async function POST(req: Request) {
  const guard = await guardPurchase("purchase.create");
  if (guard.error) return guard.error;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = purchaseOrderInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos no pedido.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await createPurchaseOrder({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      payload: parsed.data,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
