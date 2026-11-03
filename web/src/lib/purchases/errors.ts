/**
 * Erros de domínio de compras (LAC-01).
 *
 * As rotas mapeiam o `status` para o HTTP correto em vez de devolver 400 para tudo:
 * permissão negada é 403, conflito de estado/versão/idempotência é 409.
 */

export type PurchaseErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "ALCADA_NAO_CONFIGURADA"
  | "SELF_APPROVAL";

const STATUS_BY_CODE: Record<PurchaseErrorCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  ALCADA_NAO_CONFIGURADA: 409,
  SELF_APPROVAL: 403,
};

export class PurchaseError extends Error {
  readonly code: PurchaseErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: PurchaseErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "PurchaseError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const purchaseNotFound = (message = "Pedido de compra não encontrado.") =>
  new PurchaseError("NOT_FOUND", message);

export const purchaseConflict = (message: string, details?: unknown) =>
  new PurchaseError("CONFLICT", message, details);

export const purchaseValidation = (message: string, details?: unknown) =>
  new PurchaseError("VALIDATION", message, details);

export const purchaseForbidden = (message: string, details?: unknown) =>
  new PurchaseError("FORBIDDEN", message, details);

export function isPurchaseError(error: unknown): error is PurchaseError {
  return error instanceof PurchaseError;
}

/** Mensagem segura para a UI: nunca vaza stack nem texto cru de exceção desconhecida. */
export function purchaseErrorMessage(error: unknown): string {
  if (isPurchaseError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Erro inesperado ao processar a compra.";
}
