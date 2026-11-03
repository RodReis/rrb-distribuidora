import type { userRoleEnum } from "@/lib/db/schema";
import { purchaseForbidden } from "./errors";
import type { PurchaseCapability } from "./types";

export type UserRole = (typeof userRoleEnum.enumValues)[number];

/**
 * Mapa papel → capabilities do módulo de compras.
 *
 * Decisão provisória e explícita: NÃO deriva de `role_permissions.can_write`
 * (LAC-01 §7). O papel libera a capability; a faixa de valor que o aprovador
 * pode decidir vem da matriz de alçadas, nunca do papel. Quando a LAC-13
 * existir, este mapa é substituído por autorização configurável.
 *
 * Negar por padrão: papel desconhecido não recebe nenhuma capability.
 */
const CAPABILITIES_BY_ROLE: Record<UserRole, readonly PurchaseCapability[]> = {
  // Administra o sistema, mas continua proibido de aprovar o próprio pedido.
  admin: [
    "purchase.read",
    "purchase.create",
    "purchase.edit",
    "purchase.submit",
    "purchase.approve",
    "purchase.reject",
    "purchase.issue",
    "purchase.follow_up",
    "purchase.cancel",
    "purchase.configure_approval",
    "stock.receive_purchase",
  ],
  // Aprovador da alçada (LAC-01 §3): decide compras, não opera o pedido.
  diretor: [
    "purchase.read",
    "purchase.approve",
    "purchase.reject",
    "purchase.cancel",
    "purchase.configure_approval",
  ],
  // Dono do processo de compra.
  comprador: [
    "purchase.read",
    "purchase.create",
    "purchase.edit",
    "purchase.submit",
    "purchase.issue",
    "purchase.follow_up",
    "purchase.cancel",
  ],
  // Recebe fisicamente contra o PC emitido.
  estoque: ["purchase.read", "stock.receive_purchase"],
  financeiro: ["purchase.read"],
  // Vendas não participa de compras.
  vendedor: [],
};

export function getPurchaseCapabilities(role: string): PurchaseCapability[] {
  const capabilities = CAPABILITIES_BY_ROLE[role as UserRole];
  return capabilities ? [...capabilities] : [];
}

export function hasPurchaseCapability(role: string, capability: PurchaseCapability): boolean {
  return getPurchaseCapabilities(role).includes(capability);
}

export function requirePurchaseCapability(role: string, capability: PurchaseCapability): void {
  if (!hasPurchaseCapability(role, capability)) {
    throw purchaseForbidden(`Seu papel não tem a permissão "${capability}" para esta operação.`, {
      capability,
    });
  }
}

/** Papel que pode aprovar/rejeitar, independente da faixa aplicada. */
export function canDecidePurchases(role: string): boolean {
  return hasPurchaseCapability(role, "purchase.approve");
}
