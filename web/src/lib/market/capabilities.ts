export type MarketCapability =
  "market.alert.configure" | "market.backtest.execute" | "market.signal.publish";

const byRole: Record<string, readonly MarketCapability[]> = {
  admin: ["market.alert.configure", "market.backtest.execute"],
  comprador: ["market.alert.configure"],
};

export function hasMarketCapability(role: string, capability: MarketCapability): boolean {
  return byRole[role]?.includes(capability) ?? false;
}
