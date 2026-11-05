import type { userRoleEnum } from "@/lib/db/schema";
import { ProductionError } from "./errors";

type UserRole = (typeof userRoleEnum.enumValues)[number];

export type ProductionCapability =
  | "production.read"
  | "production.release"
  | "production.report"
  | "production.consume"
  | "production.close"
  | "production.approve_loss";

const CAPABILITIES_BY_ROLE: Record<UserRole, readonly ProductionCapability[]> = {
  admin: [
    "production.read",
    "production.release",
    "production.report",
    "production.consume",
    "production.close",
    "production.approve_loss",
  ],
  diretor: [
    "production.read",
    "production.release",
    "production.close",
    "production.approve_loss",
  ],
  estoque: ["production.read", "production.report", "production.consume"],
  vendedor: ["production.read"],
  comprador: [],
  financeiro: [],
};

export function getProductionCapabilities(role: string): ProductionCapability[] {
  const capabilities = CAPABILITIES_BY_ROLE[role as UserRole];
  return capabilities ? [...capabilities] : [];
}

export function hasProductionCapability(role: string, capability: ProductionCapability): boolean {
  return getProductionCapabilities(role).includes(capability);
}

export function requireProductionCapability(
  role: string,
  capability: ProductionCapability
): void {
  if (!hasProductionCapability(role, capability)) {
    throw new ProductionError(`Seu papel não tem a permissão "${capability}".`, 403);
  }
}
