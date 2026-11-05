export type MarketCapability =
  | "market.alert.configure"
  | "market.backtest.execute"
  | "market.signal.publish"
  | "market.news.review"
  | "market.news.manage"
  | "market.regulatory.read"
  | "market.regulatory.manage";

const byRole: Record<string, readonly MarketCapability[]> = {
  admin: [
    "market.alert.configure",
    "market.backtest.execute",
    "market.news.manage",
    "market.news.review",
    "market.regulatory.read",
    "market.regulatory.manage",
  ],
  comprador: ["market.alert.configure"],
  diretor: ["market.regulatory.read"],
};

export function hasMarketCapability(role: string, capability: MarketCapability): boolean {
  return byRole[role]?.includes(capability) ?? false;
}
