/**
 * Erros de domínio de fornecedores (LAC-02).
 *
 * Mesmo contrato da LAC-01: as rotas mapeiam `status` para HTTP (403 permissão,
 * 404 ausência, 409 conflito de vigência/histórico, 422 validação) em vez de
 * devolver 400 para tudo.
 */

export type SupplierErrorCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT";

const STATUS_BY_CODE: Record<SupplierErrorCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
};

export class SupplierError extends Error {
  readonly code: SupplierErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: SupplierErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "SupplierError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const supplierNotFound = (message = "Fornecedor não encontrado.") =>
  new SupplierError("NOT_FOUND", message);

export const supplierConflict = (message: string, details?: unknown) =>
  new SupplierError("CONFLICT", message, details);

export const supplierValidation = (message: string, details?: unknown) =>
  new SupplierError("VALIDATION", message, details);

export const supplierForbidden = (message: string, details?: unknown) =>
  new SupplierError("FORBIDDEN", message, details);

export function isSupplierError(error: unknown): error is SupplierError {
  return error instanceof SupplierError;
}

/** Mensagem segura para a UI: nunca vaza stack nem texto cru de exceção desconhecida. */
export function supplierErrorMessage(error: unknown): string {
  if (isSupplierError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Erro inesperado ao processar o fornecedor.";
}
