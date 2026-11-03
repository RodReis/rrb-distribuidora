import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import { hasPurchaseCapability } from "./capabilities";
import { isPurchaseError, purchaseErrorMessage } from "./errors";
import type { PurchaseCapability } from "./types";

/**
 * Guard das rotas de compras.
 *
 * A checagem é por capability do módulo (`purchase.*`), não pelo `can_write` de
 * `compras_rfq`: quem aprova é definido pela matriz de alçadas. `required` aceita
 * lista, e basta ter UMA — usado pela rota de decisão (aprovar OU rejeitar).
 */

export interface PurchaseSession extends CurrentUserSession {
  capabilities: PurchaseCapability[];
}

type Guard = { user: PurchaseSession; error?: never } | { user?: never; error: NextResponse };

export async function guardPurchase(
  required: PurchaseCapability | PurchaseCapability[]
): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }

  const capabilities = [required].flat();
  if (!capabilities.some((capability) => hasPurchaseCapability(user.role, capability))) {
    return {
      error: NextResponse.json(
        { error: "Seu papel não tem permissão para esta operação de compras." },
        { status: 403 }
      ),
    };
  }

  return { user: { ...user, capabilities } };
}

/** Traduz erro de domínio no HTTP correto (404/409/403/422) sem vazar stack. */
export function purchaseErrorResponse(error: unknown): NextResponse {
  const status = isPurchaseError(error) ? error.status : 400;
  return NextResponse.json(
    {
      error: purchaseErrorMessage(error),
      ...(isPurchaseError(error) ? { code: error.code, details: error.details } : {}),
    },
    { status }
  );
}

/** Lê a chave de idempotência do header (preferido) ou do corpo já validado. */
export function idempotencyKeyFrom(req: Request, body?: { idempotencyKey?: string }): string {
  return req.headers.get("Idempotency-Key")?.trim() || body?.idempotencyKey?.trim() || "";
}
