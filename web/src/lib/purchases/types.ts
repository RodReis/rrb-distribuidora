import type {
  purchaseApprovalDecisionEnum,
  purchaseOrderStatusEnum,
  productUnitEnum,
} from "@/lib/db/schema";

export type PurchaseStatus = (typeof purchaseOrderStatusEnum.enumValues)[number];
export type PurchaseDecision = (typeof purchaseApprovalDecisionEnum.enumValues)[number];
export type ProductUnit = (typeof productUnitEnum.enumValues)[number];

/**
 * Capabilities do módulo de compras. São distintas do RBAC de tela (`role_permissions`):
 * quem aprova é definido pela matriz de alçadas, não pelo módulo `compras_rfq`.
 * O mapeamento papel → capability fica em `capabilities.ts` até a LAC-13 existir.
 */
export const PURCHASE_CAPABILITIES = [
  "purchase.read",
  "purchase.create",
  "purchase.edit",
  "purchase.submit",
  "purchase.approve",
  "purchase.reject",
  "purchase.issue",
  "purchase.follow_up",
  "purchase.cancel",
  "purchase.configure_approval",
  "stock.receive_purchase",
] as const;

export type PurchaseCapability = (typeof PURCHASE_CAPABILITIES)[number];

/** Capabilities que podem ser exigidas por uma faixa da matriz de alçadas. */
export const PURCHASE_APPROVER_CAPABILITIES = [
  "purchase.approve",
] as const satisfies readonly PurchaseCapability[];

export interface PurchaseAdditionalCost {
  description: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Entrada (rascunho)
// ---------------------------------------------------------------------------

export interface PurchaseItemInput {
  productId: string;
  /** Default = descrição comercial do produto no momento do pedido. */
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  additionalCosts?: PurchaseAdditionalCost[];
  notes?: string | null;
}

export interface PurchaseOrderInput {
  supplierId: string;
  expectedDeliveryAt?: string | null;
  items: PurchaseItemInput[];
}

// ---------------------------------------------------------------------------
// Saída (API/UI)
// ---------------------------------------------------------------------------

export interface PurchaseItemDto {
  id: string;
  productId: string;
  sku: string;
  description: string;
  unit: ProductUnit;
  quantityOrdered: number;
  quantityReceived: number;
  quantityOpen: number;
  unitPrice: number;
  discountAmount: number;
  additionalCosts: PurchaseAdditionalCost[];
  lineTotal: number;
  notes: string | null;
}

export interface PurchaseOrderListRow {
  id: string;
  /** Rótulo exibido: `#PC-0001` ou `Rascunho` antes da emissão. */
  numberLabel: string;
  number: number | null;
  status: PurchaseStatus;
  statusLabel: string;
  supplierId: string;
  supplierName: string;
  grandTotal: number;
  expectedDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  itemCount: number;
  receivedPct: number;
  /** `true` quando o usuário logado tem a capability de decisão e o PC está na fila. */
  awaitingMyDecision: boolean;
}

export interface PurchaseApprovalDto {
  id: string;
  orderVersion: number;
  contentHash: string;
  ruleVersion: number;
  decision: PurchaseDecision;
  actorName: string | null;
  actorRole: string;
  justification: string | null;
  decidedAt: string;
}

export interface PurchaseEventDto {
  id: string;
  eventType: string;
  itemId: string | null;
  actorName: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface PurchaseReceiptDto {
  id: string;
  itemId: string;
  productDescription: string;
  lotId: string;
  lotNumber: string;
  warehouseName: string;
  quantity: number;
  unit: ProductUnit;
  unitCost: number;
  receivedAt: string;
  supplierDocumentReference: string | null;
  receivedByName: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface PurchaseVersionDto {
  version: number;
  contentHash: string;
  createdAt: string;
  createdByName: string | null;
}

export interface PurchaseApprovalRuleDto {
  id: string;
  matrixVersion: number;
  minTotal: number;
  /** `null` = última faixa, sem teto. */
  maxTotal: number | null;
  currency: string;
  approverPermission: string;
  requiredApprovals: number;
  activeFrom: string;
  activeUntil: string | null;
  createdByName: string | null;
}

export interface PurchaseOrderDetail {
  order: {
    id: string;
    number: number | null;
    numberLabel: string;
    status: PurchaseStatus;
    statusLabel: string;
    currency: string;
    expectedDeliveryAt: string | null;
    subtotal: number;
    discountTotal: number;
    additionalCostsTotal: number;
    grandTotal: number;
    currentVersion: number;
    approvedVersionHash: string | null;
    approvedRuleVersion: number | null;
    createdByName: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    issuedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  supplier: {
    id: string;
    legalName: string;
    tradeName: string | null;
    cnpj: string;
    city: string | null;
    uf: string | null;
    paymentTerms: string | null;
  };
  items: PurchaseItemDto[];
  versions: PurchaseVersionDto[];
  approvals: PurchaseApprovalDto[];
  events: PurchaseEventDto[];
  receipts: PurchaseReceiptDto[];
  /** Faixa da matriz vigente aplicada ao total atual (null = alçada não configurada). */
  approvalRule: PurchaseApprovalRuleDto | null;
  /** Quantas aprovações válidas a versão atual já tem. */
  approvalsCount: number;
  /** `true` quando o hash/versão atual diverge do aprovado (edição posterior). */
  versionDiverges: boolean;
  capabilities: PurchaseCapability[];
}

export interface PurchaseOrderSummary {
  total: number;
  byStatus: Partial<Record<PurchaseStatus, number>>;
  openGrandTotal: number;
  issuedGrandTotal: number;
  pendingApprovalCount: number;
  awaitingAlcadaCount: number;
  toReceiveCount: number;
}
