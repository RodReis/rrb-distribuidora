import type { PurchaseStatus } from "./types";

/**
 * Máquina de estados do pedido de compra (LAC-01 §5).
 *
 * Nenhuma rota ou ação muda `status` diretamente: toda transição passa por
 * `assertTransition` no servidor. `rejeitado` e `cancelado` não são estados de
 * edição; voltar a editar sempre cria/retoma um rascunho.
 */
export const PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "rascunho",
  "submetido",
  "aprovado",
  "emitido",
  "parcialmente_recebido",
  "recebido_completo",
  "rejeitado",
  "cancelado",
  "aguardando_alcada_configurada",
] as const;

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  rascunho: "Rascunho",
  submetido: "Aguardando aprovação",
  aprovado: "Aprovado",
  emitido: "Emitido",
  parcialmente_recebido: "Parcialmente recebido",
  recebido_completo: "Recebido",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  aguardando_alcada_configurada: "Aguardando alçada",
};

/** Tom do `StatusBadge` para cada estado (buy = ok, hold = atenção, risk = bloqueio). */
export const PURCHASE_STATUS_TONE: Record<PurchaseStatus, "buy" | "hold" | "risk" | "neutral"> = {
  rascunho: "neutral",
  submetido: "hold",
  aprovado: "buy",
  emitido: "buy",
  parcialmente_recebido: "hold",
  recebido_completo: "buy",
  rejeitado: "risk",
  cancelado: "neutral",
  aguardando_alcada_configurada: "risk",
};

const TRANSITIONS: Record<PurchaseStatus, readonly PurchaseStatus[]> = {
  rascunho: ["submetido", "cancelado"],
  submetido: ["aprovado", "rejeitado", "aguardando_alcada_configurada", "cancelado"],
  aprovado: ["emitido", "rascunho", "cancelado"],
  // Reabrir um aguardando alçada devolve ao rascunho para permitir edição/submissão nova.
  aguardando_alcada_configurada: ["submetido", "rascunho", "cancelado"],
  rejeitado: ["rascunho", "cancelado"],
  emitido: ["parcialmente_recebido", "recebido_completo", "cancelado"],
  // Recebimentos parciais continuam no mesmo estado até completar.
  parcialmente_recebido: ["parcialmente_recebido", "recebido_completo", "cancelado"],
  recebido_completo: [],
  cancelado: [],
};

export function canTransitionPurchase(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Estados em que o conteúdo do pedido pode ser alterado (com invalidação de aprovação). */
export const EDITABLE_STATUSES: readonly PurchaseStatus[] = [
  "rascunho",
  "rejeitado",
  "aguardando_alcada_configurada",
  "aprovado",
] as const;

export function isEditable(status: PurchaseStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** Estados terminais: nada mais acontece no pedido. */
export const TERMINAL_STATUSES: readonly PurchaseStatus[] = ["recebido_completo", "cancelado"];

export function isTerminal(status: PurchaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** PC em que o recebimento ainda pode gerar lote/movimento. */
export function canReceive(status: PurchaseStatus): boolean {
  return status === "emitido" || status === "parcialmente_recebido";
}

/** Estados em que o pedido já foi submetido alguma vez (tem versão congelada). */
export function hasFrozenVersion(status: PurchaseStatus): boolean {
  return status !== "rascunho";
}
