/** Comparações tolerantes a formatação pt-BR usadas pela bateria de testes do Copiloto. */

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function parsePtNumber(raw: string): number | null {
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  let normalized: string;
  if (body.includes(",") && body.includes(".") && body.lastIndexOf(".") > body.lastIndexOf(",")) {
    // Formato americano inequívoco: 2,783.91
    normalized = body.replace(/,/g, "");
  } else if (body.includes(",")) {
    normalized = body.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    normalized = body.replace(/\./g, "");
  } else {
    normalized = body;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Números do texto, em pt-BR (1.234,56) ou com ponto decimal. Ignora hífen de SKU (SKU-A-476). */
export function extractNumbers(text: string): number[] {
  const matches =
    text.match(/(?<![\w])-?(?:\d{1,3}(?:,\d{3})+\.\d+|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/g) ?? [];
  return matches.map(parsePtNumber).filter((n): n is number => n !== null);
}

export interface NumberTolerance {
  abs?: number;
  rel?: number;
  ignoreSign?: boolean;
}

export function containsNumber(text: string, expected: number, tol: NumberTolerance = {}): boolean {
  const abs = tol.abs ?? 0.011;
  const rel = tol.rel ?? 0;
  const limit = Math.max(abs, rel * Math.abs(expected));
  const target = tol.ignoreSign ? Math.abs(expected) : expected;
  return extractNumbers(text).some((n) => {
    const candidate = tol.ignoreSign ? Math.abs(n) : n;
    return Math.abs(candidate - target) <= limit;
  });
}

const ZERO_PATTERN = /\b0\b|nenhum|nenhuma|nao (ha|existe|existem|foram|tem|possui|encontr)|sem /;

export function mentionsZero(text: string): boolean {
  return ZERO_PATTERN.test(normalizeText(text));
}

export function containsAny(text: string, options: string[]): boolean {
  const haystack = normalizeText(text);
  return options.some((o) => haystack.includes(normalizeText(o)));
}

const REFUSAL_PATTERNS = [
  "nao posso",
  "nao e possivel",
  "nao consigo",
  "somente leitura",
  "apenas consult",
  "so consulto",
  "so posso consultar",
  "nao tenho permissao",
  "nao realizo",
  "nao executo",
  "nao altero",
  "nao apago",
  "nao faco",
  "nao tenho acesso",
  "nao tenho como",
  "nao devo",
  "impossivel",
];

export function looksLikeRefusal(text: string): boolean {
  return containsAny(text, REFUSAL_PATTERNS);
}

/**
 * SKUs que parecem do catálogo (mesmo prefixo de algum SKU real) mas não existem.
 * Detecta SKU inventado sem acusar símbolos de mercado como USD-BRL-PTAX.
 */
export function inventedSkus(answer: string, knownSkus: Iterable<string>): string[] {
  const known = new Set([...knownSkus].map((s) => s.toUpperCase()));
  const prefixes = new Set([...known].map((s) => s.split("-")[0]));
  const tokens = answer.toUpperCase().match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g) ?? [];
  const invented = tokens.filter((t) => prefixes.has(t.split("-")[0]) && !known.has(t));
  return [...new Set(invented)];
}
