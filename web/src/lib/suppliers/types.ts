import type { productUnitEnum, userRoleEnum } from "@/lib/db/schema";

export type ProductUnit = (typeof productUnitEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type DeliveryEventType =
  | "issued"
  | "promise_confirmed"
  | "promise_revised"
  | "received"
  | "receipt_reversed"
  | "cancelled";

/**
 * Capabilities do módulo de fornecedores (LAC-02). Assim como as de compras, não
 * derivam de `role_permissions.can_write`: são explícitas e negam por padrão.
 * A substituição por autorização configurável fica na LAC-13.
 */
export const SUPPLIER_CAPABILITIES = [
  "supplier.read",
  "supplier.configure_terms",
  "supplier.correct_events",
] as const;

export type SupplierCapability = (typeof SUPPLIER_CAPABILITIES)[number];

/**
 * Origem do lead time resolvido. `unavailable` = ausência de dado (nunca um default
 * numérico do código). As fontes são exibidas na interface com o rótulo abaixo.
 */
export type LeadTimeSource =
  "product_supplier_term" | "supplier_record" | "legacy_first_lot" | "unavailable";

export const LEAD_TIME_SOURCE_LABEL: Record<LeadTimeSource, string> = {
  product_supplier_term: "Condição produto × fornecedor",
  supplier_record: "Cadastro do fornecedor",
  legacy_first_lot: "Estimativa legada (primeiro lote)",
  unavailable: "Não definido",
};

export interface ResolvedLeadTime {
  /** Nulo = não definido. Nunca preenchido por default de código. */
  days: number | null;
  source: LeadTimeSource;
  /** Fornecedor preferido vigente do produto, quando existir. */
  preferredSupplierId: string | null;
  /** Termo (condição produto × fornecedor) que definiu o valor, quando aplicável. */
  termId: string | null;
}

export interface ProductSupplierTermDto {
  id: string;
  productId: string;
  sku: string;
  productDescription: string;
  supplierId: string;
  supplierName: string;
  preferred: boolean;
  leadTimeDays: number | null;
  minimumOrderQty: number | null;
  unit: ProductUnit | null;
  validFrom: string;
  validUntil: string | null;
  changedByName: string | null;
  createdAt: string;
}

/** Visão por produto para a tela de condições: "não definido" quando não há termo vigente. */
export interface ProductTermsOverviewRow {
  productId: string;
  sku: string;
  description: string;
  unit: ProductUnit;
  active: boolean;
  termId: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  leadTimeDays: number | null;
  leadTimeSource: LeadTimeSource;
  minimumOrderQty: number | null;
  minimumOrderUnit: ProductUnit | null;
  validFrom: string | null;
}

export type DeliverySituation =
  /** Completa e pontual (entra no numerador do OTIF). */
  | "otif"
  /** Completa, mas depois da data prometida original. */
  | "late"
  /** Com promessa confirmada, ainda não completa (inclui cancelada após a promessa). */
  | "incomplete"
  /** Cancelada antes de existir promessa confirmada — fora do denominador. */
  | "cancelled_before_promise"
  /** Sem data prometida confirmada — fora do denominador. */
  | "no_promise"
  /** Com promessa futura e ainda não completa — fora do denominador. */
  | "in_progress";

export const DELIVERY_SITUATION_LABEL: Record<DeliverySituation, string> = {
  otif: "OTIF",
  late: "Atrasada",
  incomplete: "Incompleta",
  cancelled_before_promise: "Cancelada antes da promessa",
  no_promise: "Sem promessa",
  in_progress: "Em andamento",
};

export interface SupplierDeliveryPromiseRevision {
  promisedAt: string;
  eventAt: string;
  note: string | null;
}

export interface SupplierDeliveryEventDto {
  id: string;
  eventType: DeliveryEventType;
  eventAt: string;
  createdAt: string;
  promisedAt: string | null;
  itemId: string | null;
  itemLabel: string | null;
  quantity: number | null;
  note: string | null;
  source: string | null;
  correctionReason: string | null;
  compensatesEventId: string | null;
  corrected: boolean;
}

export interface SupplierDeliveryItemDto {
  id: string;
  label: string;
  quantityOrdered: number;
}

export interface SupplierDeliveryDto {
  purchaseOrderId: string;
  number: number | null;
  numberLabel: string;
  status: string;
  statusLabel: string;
  issuedAt: string;
  promisedOriginalAt: string | null;
  promisedCurrentAt: string | null;
  completedAt: string | null;
  /** Dias corridos entre emissão e promessa original (nulo sem promessa). */
  promisedLeadTimeDays: number | null;
  /** Dias corridos entre emissão e conclusão efetiva (nulo se incompleta). */
  actualLeadTimeDays: number | null;
  /** Dias corridos de atraso/antecedência da conclusão vs. promessa original. */
  delayDays: number | null;
  complete: boolean;
  onTime: boolean;
  situation: DeliverySituation;
  situationLabel: string;
  revisions: SupplierDeliveryPromiseRevision[];
  items: SupplierDeliveryItemDto[];
  events: SupplierDeliveryEventDto[];
  itemsTotal: number;
  itemsComplete: number;
}

export interface SupplierPerformanceExcluded {
  noPromise: number;
  cancelledBeforePromise: number;
  inProgress: number;
}

export interface SupplierPerformanceDto {
  supplier: {
    id: string;
    name: string;
    legalName: string;
    active: boolean;
  };
  period: {
    from: string;
    to: string;
    /** Critério temporal usado no recorte, explícito para não virar default silencioso. */
    basis: "promised_at_original";
    timeZone: string;
  };
  /** Entregas elegíveis = denominador. */
  eligibleCount: number;
  otifCount: number;
  onTimeCount: number;
  completeCount: number;
  lateCount: number;
  incompleteCount: number;
  /** Nulo = sem dados (amostra zero). Nunca 0% por vacuidade. */
  otifPct: number | null;
  excluded: SupplierPerformanceExcluded;
  /** Média (dias corridos) entre emissão e conclusão das entregas completas. */
  observedLeadTimeDays: number | null;
  /** Média (dias corridos) entre emissão e promessa original. */
  promisedLeadTimeDays: number | null;
  /** Média de atraso (dias corridos) das entregas concluídas vs. promessa original. */
  averageDelayDays: number | null;
  /** Entregas com data prometida alterada (reprogramações registradas). */
  revisedPromiseCount: number;
  deliveries: SupplierDeliveryDto[];
  capabilities: SupplierCapability[];
}

export interface SupplierTermInput {
  productId: string;
  supplierId: string;
  preferred: boolean;
  leadTimeDays: number | null;
  minimumOrderQty: number | null;
  unit: ProductUnit | null;
  validFrom: string;
}
