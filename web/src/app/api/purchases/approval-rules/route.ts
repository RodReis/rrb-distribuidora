import { NextResponse } from "next/server";
import { guardPurchase, purchaseErrorResponse } from "@/lib/purchases/api-auth";
import { listApprovalMatrixHistory, saveApprovalMatrix } from "@/lib/purchases/approval-rules";
import { saveApprovalMatrixSchema } from "@/lib/purchases/schemas";

export const dynamic = "force-dynamic";

/** GET /api/purchases/approval-rules — histórico versionado da matriz de alçadas. */
export async function GET() {
  const guard = await guardPurchase("purchase.configure_approval");
  if (guard.error) return guard.error;

  try {
    const history = await listApprovalMatrixHistory(guard.user.tenantId);
    return NextResponse.json(history);
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}

/**
 * POST /api/purchases/approval-rules — grava uma NOVA versão da matriz.
 * A versão anterior é encerrada, nunca apagada; exige motivo e capability.
 */
export async function POST(req: Request) {
  const guard = await guardPurchase("purchase.configure_approval");
  if (guard.error) return guard.error;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = saveApprovalMatrixSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Matriz de alçadas inválida.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const saved = await saveApprovalMatrix({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      rows: parsed.data.rows,
      reason: parsed.data.reason,
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return purchaseErrorResponse(error);
  }
}
