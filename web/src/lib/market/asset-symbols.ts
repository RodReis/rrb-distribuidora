export const ASSET_SYMBOLS = {
  PTAX: "USD-BRL-PTAX",
  LME_ALU: "LME-ALU",
  HRC_US: "CME-HRC",
  HRC_CN: "CN-HRC-FOB",
} as const;

export type AssetSymbol = (typeof ASSET_SYMBOLS)[keyof typeof ASSET_SYMBOLS];
