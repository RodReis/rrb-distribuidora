import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[\s_/]+/g, "-");

const ALIASES: Record<string, string> = {
  PTAX: ASSET_SYMBOLS.PTAX,
  USD: ASSET_SYMBOLS.PTAX,
  BRL: ASSET_SYMBOLS.PTAX,
  DOLAR: ASSET_SYMBOLS.PTAX,
  "USD-BRL": ASSET_SYMBOLS.PTAX,
  "BRL-USD": ASSET_SYMBOLS.PTAX,
  "PTAX-USD": ASSET_SYMBOLS.PTAX,
  "USD-PTAX": ASSET_SYMBOLS.PTAX,
  "DOLAR-PTAX": ASSET_SYMBOLS.PTAX,
  ALU: ASSET_SYMBOLS.LME_ALU,
  ALUMINIO: ASSET_SYMBOLS.LME_ALU,
  ALUMINIUM: ASSET_SYMBOLS.LME_ALU,
  "LME-ALUMINIO": ASSET_SYMBOLS.LME_ALU,
  HRC: ASSET_SYMBOLS.HRC_US,
  "HRC-US": ASSET_SYMBOLS.HRC_US,
  "HRC-EUA": ASSET_SYMBOLS.HRC_US,
  "BOBINA-A-QUENTE": ASSET_SYMBOLS.HRC_US,
  "HRC-CN": ASSET_SYMBOLS.HRC_CN,
  "HRC-CHINA": ASSET_SYMBOLS.HRC_CN,
  "HRC-FOB-CHINA": ASSET_SYMBOLS.HRC_CN,
};

/** Converte o nome dado pelo modelo no símbolo cadastrado, ou devolve o texto normalizado. */
export function resolveAssetSymbol(raw: string): string {
  const key = normalize(raw);
  const known = Object.values(ASSET_SYMBOLS) as string[];
  if (known.includes(key)) return key;
  return ALIASES[key] ?? key;
}
