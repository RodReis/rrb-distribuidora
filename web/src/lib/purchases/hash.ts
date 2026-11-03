import { createHash } from "node:crypto";

/**
 * Hash do conteúdo aprovado (LAC-01 §2 "Conteúdo aprovado").
 *
 * O JSON é canônico: chaves ordenadas e números normalizados para string decimal
 * de 4 casas, para que a mesma versão gere sempre o mesmo hash em qualquer
 * ordem de itens/campos. É esse hash que a emissão revalida.
 */

export interface PurchaseContentItem {
  productId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount: string;
  additionalCosts: { description: string; amount: string }[];
  notes: string | null;
}

export interface PurchaseContent {
  supplierId: string;
  currency: string;
  expectedDeliveryAt: string | null;
  items: PurchaseContentItem[];
}

const fixed = (value: unknown, digits = 4): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
};

/** Ordena chaves recursivamente para uma serialização estável. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function buildPurchaseContent(input: {
  supplierId: string;
  currency: string;
  expectedDeliveryAt: Date | null;
  items: {
    productId: string;
    description: string;
    quantity: unknown;
    unit: string;
    unitPrice: unknown;
    discountAmount: unknown;
    additionalCosts?: { description: string; amount: number }[] | null;
    notes?: string | null;
  }[];
}): PurchaseContent {
  return {
    supplierId: input.supplierId,
    currency: input.currency,
    expectedDeliveryAt: input.expectedDeliveryAt ? input.expectedDeliveryAt.toISOString() : null,
    items: input.items.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: fixed(item.quantity),
      unit: item.unit,
      unitPrice: fixed(item.unitPrice),
      discountAmount: fixed(item.discountAmount),
      additionalCosts: (item.additionalCosts ?? []).map((cost) => ({
        description: cost.description,
        amount: fixed(cost.amount, 2),
      })),
      notes: item.notes?.trim() ? item.notes.trim() : null,
    })),
  };
}

export function hashPurchaseContent(content: PurchaseContent | unknown): string {
  return createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");
}
