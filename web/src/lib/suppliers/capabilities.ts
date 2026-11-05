import type { UserRole } from "./types";
import { supplierForbidden } from "./errors";
import type { SupplierCapability } from "./types";

/**
 * Mapa papel → capabilities do módulo de fornecedores (LAC-02).
 *
 * Não deriva de `role_permissions.can_write` (cadastros_fornecedores). O papel
 * libera capabilities explícitas: admin e comprador podem criar/revisar condições;
 * demais papéis autorizados consultam dados. A LAC-13 pode substituir este mapa
 * por autorização configurável.
 *
 * Negar por padrão: papel desconhecido não recebe nenhuma capability.
 */
const CAPABILITIES_BY_ROLE: Record<UserRole, readonly SupplierCapability[]> = {
  // Administra o sistema e opera as condições de compra.
  admin: ["supplier.read", "supplier.configure_terms", "supplier.correct_events"],
  // Aprova compras e consulta desempenho; não cria nem revisa condições.
  diretor: ["supplier.read"],
  // Dono do processo de compra: negocia prazo e lote mínimo por produto.
  comprador: ["supplier.read", "supplier.configure_terms", "supplier.correct_events"],
  // Recebe contra o PC e consulta o histórico de entrega.
  estoque: ["supplier.read"],
  financeiro: ["supplier.read"],
  // Vendas não participa do cadastro/desempenho de fornecedores.
  vendedor: [],
};

export function getSupplierCapabilities(role: string): SupplierCapability[] {
  const capabilities = CAPABILITIES_BY_ROLE[role as UserRole];
  return capabilities ? [...capabilities] : [];
}

export function hasSupplierCapability(role: string, capability: SupplierCapability): boolean {
  return getSupplierCapabilities(role).includes(capability);
}

export function requireSupplierCapability(role: string, capability: SupplierCapability): void {
  if (!hasSupplierCapability(role, capability)) {
    throw supplierForbidden(`Seu papel não tem a permissão "${capability}" para esta operação.`, {
      capability,
    });
  }
}

export function canConfigureSupplierTerms(role: string): boolean {
  return hasSupplierCapability(role, "supplier.configure_terms");
}
