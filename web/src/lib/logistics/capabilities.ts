import type { userRoleEnum } from "@/lib/db/schema";

type Role = (typeof userRoleEnum.enumValues)[number];
export type LogisticsCapability =
  "logistics.read" | "logistics.prepare" | "logistics.dispatch" | "logistics.track";

const roles: Record<Role, readonly LogisticsCapability[]> = {
  admin: ["logistics.read", "logistics.prepare", "logistics.dispatch", "logistics.track"],
  diretor: ["logistics.read", "logistics.prepare", "logistics.dispatch", "logistics.track"],
  estoque: ["logistics.read", "logistics.prepare", "logistics.track"],
  comprador: [],
  vendedor: [],
  financeiro: [],
};

export function hasLogisticsCapability(role: string, capability: LogisticsCapability) {
  return roles[role as Role]?.includes(capability) ?? false;
}

export function etaLabel(eta: Date | null, now = new Date()) {
  if (!eta) return "Sem previsão";
  return eta.getTime() < now.getTime() ? "Atraso estimado" : "Previsão estimada";
}
