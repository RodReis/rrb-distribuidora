import type { ProductUnit } from "@/lib/purchases/types";

/**
 * Utilitários de apresentação da tela de detalhe do pedido de compra (LAC-01).
 *
 * Ficam fora dos componentes para o `page.tsx` (server), a aba de aprovações e a
 * timeline compartilharem os mesmos formatos — especialmente hash curto: a tela
 * nunca exibe o hash completo do conteúdo aprovado.
 */

export const PURCHASE_DETAIL_TABS = [
  "itens",
  "aprovacoes",
  "timeline",
  "recebimentos",
  "documento",
] as const;

export type PurchaseDetailTab = (typeof PURCHASE_DETAIL_TABS)[number];

export function isPurchaseDetailTab(value: string | undefined): value is PurchaseDetailTab {
  return !!value && (PURCHASE_DETAIL_TABS as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  diretor: "Diretor",
  comprador: "Comprador",
  vendedor: "Vendedor",
  estoque: "Estoque",
  financeiro: "Financeiro",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

export const UNIT_LABELS: Record<ProductUnit, string> = {
  kg: "kg",
  m: "m",
  un: "un",
  t: "t",
};

export function unitLabel(unit: ProductUnit | null | undefined): string {
  return unit ? (UNIT_LABELS[unit] ?? unit) : "—";
}

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  confirmacao: "Confirmação do fornecedor",
  contato: "Contato realizado",
  ocorrencia: "Ocorrência",
  previsao: "Previsão atualizada",
};

export const APPROVAL_DECISION_LABEL: Record<string, string> = {
  approved: "Aprovado",
  rejected: "Rejeitado",
};

export const APPROVER_PERMISSION_LABELS: Record<string, string> = {
  "purchase.approve": "Aprovação de compras (diretor/admin habilitado na alçada)",
};

export function approverPermissionLabel(permission: string | null | undefined): string {
  if (!permission) return "—";
  return APPROVER_PERMISSION_LABELS[permission] ?? permission;
}

/**
 * Fuso de exibição fixo (horário de Brasília) para a data renderizar igual no
 * servidor e no navegador — evita divergência de hidratação perto da meia-noite.
 */
const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

/** Data/hora pt-BR a partir de ISO. Aceita null para exibir "—". */
export function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/**
 * Data pt-BR (sem hora) para campos de data pura, como previsão de entrega.
 *
 * O valor é persistido como timestamp (meia-noite UTC quando vem de
 * `input[type=date]`), então formatar pelo fuso local deslocaria o dia. Aqui a
 * data é lida diretamente da parte `YYYY-MM-DD` do ISO, sem depender de fuso.
 */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Formata quantidade com até 4 casas (numeric(12,4) do banco), sem zero à direita. */
export function formatQuantity(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/** Quantidade com unidade: `12,5 kg`. */
export function formatQuantityWithUnit(
  value: number | null | undefined,
  unit: ProductUnit | null | undefined
): string {
  return `${formatQuantity(value)} ${unitLabel(unit)}`;
}

/**
 * Hash curto para a UI. O hash completo identifica a versão aprovada e nunca
 * deve ser exposto na tela: 8 caracteres bastam para conferência visual.
 */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…`;
}

/** Percentual recebido do pedido (0–100), arredondado para exibição. */
export function receivedPercentage(
  items: { quantityOrdered: number; quantityReceived: number }[]
): number {
  const ordered = items.reduce((total, item) => total + Number(item.quantityOrdered), 0);
  if (ordered <= 0) return 0;
  const received = items.reduce((total, item) => total + Number(item.quantityReceived), 0);
  return Math.min(100, Math.round((received / ordered) * 1000) / 10);
}

/** Chave de idempotência gerada no cliente (UUID v4 quando disponível). */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Converte texto digitado (pt-BR com vírgula ou decimal com ponto) em número. */
export function parseDecimalInput(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return Number.NaN;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Lê JSON de uma resposta sem estourar quando a rota devolve HTML/404. */
export async function parseJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Mensagem acionável em PT-BR para o toast: usa o `error` do servidor quando
 * existe e cai num texto amigável quando a rota ainda não está publicada.
 */
export function apiErrorFromBody(
  body: Record<string, unknown> | null,
  response: Response,
  fallback: string
): string {
  if (body && typeof body.error === "string" && body.error.trim()) return body.error;
  if (response.status === 404) {
    return "Este recurso ainda não está disponível no servidor (HTTP 404).";
  }
  if (response.status === 401) return "Sessão expirada. Entre novamente.";
  if (response.status === 403) return "Seu papel não tem permissão para esta operação.";
  if (response.status === 409) {
    return "O pedido mudou de estado. Recarregue a tela e tente novamente.";
  }
  return `${fallback} (HTTP ${response.status}).`;
}
