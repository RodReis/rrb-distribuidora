export type MarketCapability = "market.alert.configure";

const byRole: Record<string, readonly MarketCapability[]> = {
  admin: ["market.alert.configure"],
  comprador: ["market.alert.configure"],
};

export function hasMarketCapability(role: string, capability: MarketCapability): boolean {
  return byRole[role]?.includes(capability) ?? false;
}
