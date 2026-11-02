/**
 * Motor de precificação determinístico — MVP-03.
 *
 * Regra de margem bruta: (preço - custo) / preço. O custo considera
 * matéria-prima pelo peso bruto (sucata paga) + processo da máquina.
 * Nenhum valor é confiado ao cliente: o servidor recalcula tudo.
 */

export const QUOTE_STATUSES = [
  "rascunho",
  "bloqueado_margem",
  "enviado",
  "em_negociacao",
  "aprovado",
  "perdido",
  "expirado",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_CHANNELS = ["whatsapp", "email", "phone", "counter"] as const;
export type QuoteChannel = (typeof QUOTE_CHANNELS)[number];

export const LOSS_REASONS = [
  "Preço da concorrência",
  "Prazo de entrega",
  "Desistência da obra",
  "Condição de pagamento",
  "Especificação técnica divergente",
  "Outro",
] as const;

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  bloqueado_margem: "Bloqueado por margem",
  enviado: "Enviado",
  em_negociacao: "Em negociação",
  aprovado: "Aprovado",
  perdido: "Perdido",
  expirado: "Expirado",
};

export const QUOTE_CHANNEL_LABELS: Record<QuoteChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  counter: "Balcão",
};

const QUOTE_STATUS_COLORS: Record<QuoteStatus, "buy" | "hold" | "risk"> = {
  rascunho: "hold",
  bloqueado_margem: "risk",
  enviado: "buy",
  em_negociacao: "hold",
  aprovado: "buy",
  perdido: "risk",
  expirado: "risk",
};

export function quoteStatusTone(status: string): "buy" | "hold" | "risk" {
  return QUOTE_STATUS_COLORS[status as QuoteStatus] ?? "hold";
}

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status as QuoteStatus] ?? status;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  aguardando_producao: "Aguardando produção",
  em_corte: "Em corte",
  pronto_faturamento: "Pronto para faturamento",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/**
 * Transições permitidas no funil.
 *
 * `bloqueado_margem` só sai por `rascunho` (liberação do diretor) ou por
 * encerramento. `perdido` e `expirado` são terminais. A conversão em pedido
 * não muda o status do orçamento — ela cria o `sales_orders`.
 */
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  rascunho: ["enviado", "bloqueado_margem", "perdido", "expirado"],
  bloqueado_margem: ["rascunho", "perdido", "expirado"],
  enviado: ["em_negociacao", "perdido", "expirado"],
  em_negociacao: ["aprovado", "perdido", "expirado"],
  aprovado: ["perdido", "expirado"],
  perdido: [],
  expirado: [],
};

export function canTransitionQuoteStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = QUOTE_STATUS_TRANSITIONS[from as QuoteStatus];
  return !!allowed && allowed.includes(to as QuoteStatus);
}

export const CHANNEL_TONES: Record<QuoteChannel, string> = {
  whatsapp: "border-signal-buy/30 bg-signal-buy/10 text-signal-buy",
  email: "border-titanium-steel/30 bg-titanium-steel/10 text-titanium-light",
  phone: "border-signal-hold/30 bg-signal-hold/10 text-signal-hold",
  counter: "border-carmine-core/30 bg-carmine-core/10 text-carmine-signal",
};

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function formatQuoteNumber(quoteNumber: number | string): string {
  const n = Number(quoteNumber);
  return Number.isFinite(n) ? `#${1000 + n}` : "—";
}

/** Aplica o delta do índice de mercado ao custo-base, com trava de ±20%. */
export function applyMarketDelta(baseCostPerKg: number, deltaPct: number): number {
  if (!Number.isFinite(baseCostPerKg) || baseCostPerKg <= 0) return 0;
  const capped = Math.max(-20, Math.min(20, Number.isFinite(deltaPct) ? deltaPct : 0));
  return round(baseCostPerKg * (1 + capped / 100), 4);
}

export interface ItemPricingInput {
  quantity: number;
  /** Peso líquido por peça (kg). */
  netWeightKg: number;
  /** Peso bruto por peça (kg), já com kerf. */
  grossWeightKg: number;
  replacementCostPerKg: number;
  targetMarginPct: number;
  processMinutesPerPiece: number;
  machineCostPerHour: number;
  /** Preço unitário digitado pelo vendedor. Ignora margem/desconto sugeridos. */
  manualUnitPrice?: number | null;
  remnant?: {
    weightKg?: number | null;
    /** Custo do retalho por kg. Padrão: 65% do custo de reposição. */
    costPerKg?: number | null;
  } | null;
  discountPct?: number | null;
}

export interface ItemPricingResult {
  quantity: number;
  unitMaterialCost: number;
  unitProcessCost: number;
  unitCost: number;
  unitPrice: number;
  totalMaterialCost: number;
  totalProcessCost: number;
  totalCost: number;
  totalItemAmount: number;
  itemMarginPct: number;
  salePricePerKg: number;
  effectiveMaterialCostPerKg: number;
  /** Preço mínimo que respeita a margem alvo (por peça). */
  suggestedUnitPrice: number;
  belowReplacementCost: boolean;
  belowTargetMargin: boolean;
  usedRemnant: boolean;
}

export function computeItemPricing(input: ItemPricingInput): ItemPricingResult {
  const quantity = Math.max(1, Math.trunc(input.quantity || 1));
  const netWeightKg = Math.max(0, input.netWeightKg);
  const grossWeightKg = Math.max(0, input.grossWeightKg);
  const replacement = Math.max(0, input.replacementCostPerKg);
  const target = Math.max(0, Math.min(95, input.targetMarginPct));
  const discount = Math.max(0, Math.min(90, input.discountPct ?? 0));

  const usedRemnant = !!input.remnant;
  const effectiveRate = usedRemnant
    ? Math.max(0, input.remnant?.costPerKg ?? replacement * 0.65)
    : replacement;

  // No retalho o custo incide só sobre o peso líquido aproveitado; na chapa
  // virgem o peso bruto (incluindo kerf/sucata) é pago pelo cliente.
  const materialWeight = usedRemnant ? netWeightKg : grossWeightKg;
  const unitMaterialCost = round(materialWeight * effectiveRate, 4);
  const unitProcessCost = round(
    (Math.max(0, input.processMinutesPerPiece) / 60) * Math.max(0, input.machineCostPerHour),
    4
  );
  const unitCost = round(unitMaterialCost + unitProcessCost, 4);

  const suggestedUnitPrice = target >= 100 ? unitCost : round(unitCost / (1 - target / 100), 2);
  const manualPrice =
    input.manualUnitPrice != null && input.manualUnitPrice > 0
      ? round(input.manualUnitPrice, 2)
      : null;
  const unitPrice = manualPrice ?? round(suggestedUnitPrice * (1 - discount / 100), 2);
  const totalItemAmount = round(unitPrice * quantity, 2);
  const totalCost = round(unitCost * quantity, 4);

  const itemMarginPct = unitPrice > 0 ? round(((unitPrice - unitCost) / unitPrice) * 100, 2) : 0;
  const salePricePerKg = netWeightKg > 0 ? round(unitPrice / netWeightKg, 4) : 0;

  return {
    quantity,
    unitMaterialCost,
    unitProcessCost,
    unitCost,
    unitPrice,
    totalMaterialCost: round(unitMaterialCost * quantity, 2),
    totalProcessCost: round(unitProcessCost * quantity, 2),
    totalCost: round(totalCost, 2),
    totalItemAmount,
    itemMarginPct,
    salePricePerKg,
    effectiveMaterialCostPerKg: round(effectiveRate, 4),
    suggestedUnitPrice,
    belowReplacementCost: netWeightKg > 0 && effectiveRate > 0 && salePricePerKg < effectiveRate,
    belowTargetMargin: itemMarginPct < target,
    usedRemnant,
  };
}

export interface QuoteSummaryInput {
  items: Array<{
    totalMaterialCost: number;
    totalProcessCost: number;
    totalItemAmount: number;
    itemMarginPct: number;
    belowReplacementCost: boolean;
  }>;
  freightCost: number;
  servicesCost: number;
  minMarginPct: number;
}

export interface QuoteSummary {
  itemCount: number;
  totalMaterialCost: number;
  totalProcessCost: number;
  totalFreightCost: number;
  totalServicesCost: number;
  totalCost: number;
  totalAmount: number;
  grossMarginPct: number;
  blocked: boolean;
  blockReasons: string[];
  /** Bloqueio duro: vender abaixo do custo de reposição nunca é liberável. */
  belowReplacementCost: boolean;
}

export function summarizeQuote(input: QuoteSummaryInput): QuoteSummary {
  const totalMaterialCost = round(
    input.items.reduce((sum, item) => sum + item.totalMaterialCost, 0),
    2
  );
  const totalProcessCost = round(
    input.items.reduce((sum, item) => sum + item.totalProcessCost, 0),
    2
  );
  const itemsSubtotal = round(
    input.items.reduce((sum, item) => sum + item.totalItemAmount, 0),
    2
  );
  const totalFreightCost = round(Math.max(0, input.freightCost), 2);
  const totalServicesCost = round(Math.max(0, input.servicesCost), 2);
  const totalAmount = round(itemsSubtotal + totalFreightCost + totalServicesCost, 2);
  const totalCost = round(
    totalMaterialCost + totalProcessCost + totalFreightCost + totalServicesCost,
    2
  );
  const grossMarginPct =
    totalAmount > 0 ? round(((totalAmount - totalCost) / totalAmount) * 100, 2) : 0;

  const blockReasons: string[] = [];
  const belowReplacementCost = input.items.some((item) => item.belowReplacementCost);
  if (belowReplacementCost) {
    blockReasons.push("Há item com preço de venda abaixo do custo de reposição.");
  }
  if (grossMarginPct < input.minMarginPct) {
    blockReasons.push(
      `Margem bruta de ${grossMarginPct.toFixed(2)}% abaixo da política de ${input.minMarginPct.toFixed(2)}%.`
    );
  }

  return {
    itemCount: input.items.length,
    totalMaterialCost,
    totalProcessCost,
    totalFreightCost,
    totalServicesCost,
    totalCost,
    totalAmount,
    grossMarginPct,
    blocked: blockReasons.length > 0,
    blockReasons,
    belowReplacementCost,
  };
}

export interface ValidityResult {
  validUntil: Date;
  hours: number;
  label: string;
  volatilityPct: number;
}

/**
 * Validade dinâmica:
 * - volatilidade semanal > 3% → 48 h
 * - > 1,5% → 72 h
 * - mercado calmo → 7 dias, encerrando às 18h00
 */
export function computeQuoteValidity(
  volatilityPct: number,
  now: Date = new Date()
): ValidityResult {
  const vol = Math.abs(Number.isFinite(volatilityPct) ? volatilityPct : 0);
  const base = new Date(now.getTime());

  if (vol > 3) {
    return {
      validUntil: new Date(base.getTime() + 48 * 60 * 60 * 1000),
      hours: 48,
      label: "48 horas",
      volatilityPct: round(vol, 2),
    };
  }

  if (vol > 1.5) {
    return {
      validUntil: new Date(base.getTime() + 72 * 60 * 60 * 1000),
      hours: 72,
      label: "72 horas",
      volatilityPct: round(vol, 2),
    };
  }

  const validUntil = new Date(base.getTime());
  validUntil.setDate(validUntil.getDate() + 7);
  validUntil.setHours(18, 0, 0, 0);

  return {
    validUntil,
    hours: 168,
    label: "7 dias",
    volatilityPct: round(vol, 2),
  };
}

/** Horas restantes até a validade (mínimo zero). */
export function hoursUntil(date: Date | string, now: Date = new Date()): number {
  const target = typeof date === "string" ? new Date(date) : date;
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / (60 * 60 * 1000)));
}

export function isQuoteExpired(validUntil: Date | string, now: Date = new Date()): boolean {
  const target = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  return target.getTime() < now.getTime();
}

/** Margem sugerida de venda a partir de um custo unitário. */
export function priceFromMargin(unitCost: number, marginPct: number): number {
  const margin = Math.max(0, Math.min(95, marginPct));
  return margin >= 95 ? unitCost : round(unitCost / (1 - margin / 100), 2);
}
