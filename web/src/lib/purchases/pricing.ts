import type { PurchaseAdditionalCost } from "./types";

/**
 * Totais do pedido de compra. Calculados SEMPRE no servidor (LAC-01 §2/§4):
 * o cliente nunca envia total, só quantidade, preço unitário, desconto e custos
 * adicionais discriminados.
 */

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export interface PurchaseLineInput {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  additionalCosts?: PurchaseAdditionalCost[] | null;
}

export interface ComputedLine {
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  additionalCosts: PurchaseAdditionalCost[];
  lineTotal: number;
}

/** Total da linha = quantidade × preço unitário − desconto + custos adicionais. */
export function computePurchaseLine(input: PurchaseLineInput): ComputedLine {
  const quantity = roundQuantity(input.quantity);
  const unitPrice = Number(input.unitPrice);
  const discountAmount = roundMoney(input.discountAmount ?? 0);
  const additionalCosts = (input.additionalCosts ?? [])
    .map((cost) => ({ description: cost.description.trim(), amount: roundMoney(cost.amount) }))
    .filter((cost) => cost.description.length > 0);

  const additionalTotal = additionalCosts.reduce((acc, cost) => acc + cost.amount, 0);
  const lineTotal = roundMoney(quantity * unitPrice - discountAmount + additionalTotal);

  return { quantity, unitPrice, discountAmount, additionalCosts, lineTotal };
}

export interface PurchaseTotals {
  subtotal: number;
  discountTotal: number;
  additionalCostsTotal: number;
  grandTotal: number;
}

export function computePurchaseTotals(lines: ComputedLine[]): PurchaseTotals {
  const subtotal = roundMoney(
    lines.reduce((acc, line) => acc + roundMoney(line.quantity * line.unitPrice), 0)
  );
  const discountTotal = roundMoney(lines.reduce((acc, line) => acc + line.discountAmount, 0));
  const additionalCostsTotal = roundMoney(
    lines.reduce(
      (acc, line) => acc + line.additionalCosts.reduce((sum, cost) => sum + cost.amount, 0),
      0
    )
  );
  const grandTotal = roundMoney(subtotal - discountTotal + additionalCostsTotal);

  return { subtotal, discountTotal, additionalCostsTotal, grandTotal };
}

export interface PurchaseQuantityLike {
  quantityOrdered: unknown;
  quantityReceived: unknown;
}

export function openQuantity(item: PurchaseQuantityLike): number {
  return roundQuantity(Number(item.quantityOrdered) - Number(item.quantityReceived));
}

/** Percentual recebido do pedido (0–100), arredondado para exibição. */
export function receivedPercentage(items: PurchaseQuantityLike[]): number {
  const ordered = items.reduce((acc, item) => acc + Number(item.quantityOrdered), 0);
  if (ordered <= 0) return 0;
  const received = items.reduce((acc, item) => acc + Number(item.quantityReceived), 0);
  return Math.min(100, Math.round((received / ordered) * 1000) / 10);
}
