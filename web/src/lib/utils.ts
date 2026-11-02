import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumberBR(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Máscara de entrada monetária pt-BR (`1.234,56`).
 *
 * O texto digitado é a fonte da verdade durante a edição: só dígitos e uma
 * vírgula sobrevivem. Sem separador de milhar no estado, para não conflitar com
 * o ponto decimal do número. Decimais além do limite configurado são cortados.
 */
export function sanitizeCurrencyInput(raw: string, decimals = 2): string {
  const digits = raw.replace(/[^\d,]/g, "");
  const comma = digits.indexOf(",");
  if (comma === -1) return digits;

  const integer = digits.slice(0, comma).replace(/,/g, "");
  const fraction = digits
    .slice(comma + 1)
    .replace(/,/g, "")
    .slice(0, decimals);
  return `${integer},${fraction}`;
}

/** Agrupa o milhar pt-BR sem tocar na parte decimal que o usuário está digitando. */
export function formatCurrencyInput(text: string): string {
  if (!text) return "";
  const [integer = "", fraction] = text.split(",");
  const grouped = integer.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

/** Converte o texto mascarado de volta em reais. Texto vazio ou inválido vira 0. */
export function parseCurrencyInput(text: string): number {
  if (!text) return 0;
  const parsed = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Converte um número em texto editável pt-BR (vírgula decimal, sem milhar).
 * Zero e valores ausentes viram string vazia para o placeholder aparecer, e o
 * arredondamento corta sujeira de ponto flutuante vinda de cálculos.
 */
export function toCurrencyInputText(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "";
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}
