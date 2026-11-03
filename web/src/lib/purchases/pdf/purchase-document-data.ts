/**
 * Modelo de apresentação do Pedido de Compra em PDF — LAC-01 US-04.
 *
 * Módulo puro (sem React/@react-pdf/renderer e SEM acesso ao banco) para poder
 * ser testado diretamente: recebe a forma estrutural devolvida por
 * `getPurchaseDocumentData` e devolve rótulos/valores já formatados em pt-BR.
 *
 * HOMOLOGAÇÃO (LAC-12): o cadastro fiscal da distribuidora (razão social fiscal,
 * CNPJ, endereço, inscrição estadual etc.) ainda NÃO existe no tenant. Enquanto
 * ele não for provisionado e verificado pela LAC-12, o documento:
 *   - exibe a faixa e a marca d'água "DOCUMENTO EM HOMOLOGAÇÃO" em todas as páginas;
 *   - NÃO pode se apresentar como documento fiscal final nem substituir a nota
 *     fiscal (ver `HOMOLOGATION_DETAIL`);
 *   - mantém os dados fiscais da compradora como pendentes, em vez de inventar
 *     dados ou omiti-los silenciosamente.
 * Decisão registrada em docs/specs/LAC-01-compras-operacionais.md (US-04 e risco
 * "PDF sem dados da distribuidora"). Não remover este aviso antes da LAC-12.
 */

import { PURCHASE_STATUS_LABEL } from "../state-machine";
import type { ProductUnit, PurchaseAdditionalCost, PurchaseStatus } from "../types";

/** Aviso obrigatório exibido no documento enquanto a LAC-12 não existir. */
export const HOMOLOGATION_NOTICE =
  "DOCUMENTO EM HOMOLOGAÇÃO — cadastro fiscal da distribuidora pendente (LAC-12)";

/** Complemento do aviso: o PDF não é documento fiscal final e não substitui a NF. */
export const HOMOLOGATION_DETAIL =
  "Cadastro fiscal da distribuidora pendente (LAC-12). Este PDF é uma representação operacional do pedido: não é documento fiscal final e não substitui a nota fiscal.";

/** Tamanho do hash curto exibido no rodapé (SHA-256 completo tem 64 caracteres). */
export const SHORT_APPROVAL_HASH_LENGTH = 12;

// ---------------------------------------------------------------------------
// Entrada: forma estrutural de `getPurchaseDocumentData` (service.ts).
// ---------------------------------------------------------------------------

export interface PurchasePdfSourceItem {
  sku: string;
  productDescriptionSnapshot: string;
  unit: ProductUnit;
  quantityOrdered: number | string;
  unitPrice: number | string;
  discountAmount: number | string;
  additionalCosts: PurchaseAdditionalCost[] | null;
  lineTotal: number | string;
  notes: string | null;
}

export interface PurchasePdfSourceOrder {
  number: number | null;
  status: PurchaseStatus;
  currency: string;
  expectedDeliveryAt: Date | string | null;
  subtotal: number | string;
  discountTotal: number | string;
  additionalCostsTotal: number | string;
  grandTotal: number | string;
  currentVersion: number;
  approvedVersionHash: string | null;
  approvedAt: Date | string | null;
  issuedAt: Date | string | null;
  createdAt: Date | string;
}

export interface PurchasePdfSource {
  tenantName: string;
  order: PurchasePdfSourceOrder;
  supplier: {
    legalName: string;
    tradeName?: string | null;
    cnpj: string;
    city: string | null;
    uf: string | null;
    paymentTerms: string | null;
  };
  items: PurchasePdfSourceItem[];
}

// ---------------------------------------------------------------------------
// Saída já formatada: o componente só apresenta, nunca decide número/regra.
// ---------------------------------------------------------------------------

export interface PurchasePdfItem {
  sku: string;
  description: string;
  quantityLabel: string;
  unitPriceLabel: string;
  /** "—" quando não há desconto, para a tabela não parecer quebrada. */
  discountLabel: string;
  additionalCostsLabel: string;
  additionalCostsDetail: string;
  lineTotalLabel: string;
  notes: string | null;
}

export interface PurchasePdfApproval {
  /** `v3` quando existe versão congelada; `—` no rascunho. */
  versionLabel: string;
  /** Hash aprovado truncado; `—` quando não houve aprovação. */
  hashLabel: string;
  approvedAtLabel: string;
}

export interface PurchasePdfData {
  tenantName: string;
  /** `#PC-0001` (emitido) ou `RASCUNHO — NÃO EMITIDO` (antes da emissão). */
  numberLabel: string;
  isDraft: boolean;
  statusLabel: string;
  issuedAtLabel: string;
  expectedDeliveryLabel: string;
  currencyLabel: string;
  supplier: {
    legalName: string;
    tradeName: string | null;
    cnpjLabel: string;
    cityUfLabel: string;
    paymentTermsLabel: string;
  };
  items: PurchasePdfItem[];
  totals: {
    subtotalLabel: string;
    discountLabel: string;
    additionalCostsLabel: string;
    grandTotalLabel: string;
  };
  approval: PurchasePdfApproval;
  homologationNotice: string;
  homologationDetail: string;
}

// ---------------------------------------------------------------------------
// Formatação pt-BR (pura, exportada porque também é usada nos testes)
// ---------------------------------------------------------------------------

const unitLabels: Record<ProductUnit, string> = {
  kg: "kg",
  m: "m",
  un: "un",
  t: "t",
};

export function formatMoneyBR(value: number | string | null | undefined): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatQuantityBR(value: number | string | null | undefined): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateBR(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTimeBR(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  // Data e hora separadas para não herdar a vírgula do locale no rodapé do PDF.
  const day = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/** Máscara de CNPJ (`12.345.678/0001-90`); mantém o valor cru se não tiver 14 dígitos. */
export function formatCnpjBR(cnpj: string | null | undefined): string {
  const raw = (cnpj ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return raw || "—";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(
    8,
    12
  )}-${digits.slice(12)}`;
}

/** Hash curto do rodapé — mesma convenção de exibição usada na timeline do PC. */
export function shortApprovalHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.slice(0, SHORT_APPROVAL_HASH_LENGTH).toLowerCase();
}

/** Rótulo do documento: `#PC-0001` ou rascunho explícito (mesmo formato da lista). */
export function purchasePdfNumberLabel(number: number | null | undefined): string {
  if (!number) return "RASCUNHO — NÃO EMITIDO";
  return `#PC-${String(number).padStart(4, "0")}`;
}

/**
 * Converte os dados do serviço no modelo de apresentação do PDF.
 * Não recalcula totais: usa os valores já persistidos no pedido (fonte de verdade).
 */
export function buildPurchasePdfData(source: PurchasePdfSource): PurchasePdfData {
  const { order, supplier, tenantName } = source;

  return {
    tenantName,
    numberLabel: purchasePdfNumberLabel(order.number),
    isDraft: !order.number,
    statusLabel: PURCHASE_STATUS_LABEL[order.status] ?? order.status,
    // Emitido → data da emissão; antes disso, a data que identifica o documento.
    issuedAtLabel: formatDateTimeBR(order.issuedAt ?? order.createdAt),
    expectedDeliveryLabel: formatDateBR(order.expectedDeliveryAt),
    currencyLabel: order.currency || "BRL",
    supplier: {
      legalName: supplier.legalName,
      tradeName: supplier.tradeName ?? null,
      cnpjLabel: formatCnpjBR(supplier.cnpj),
      cityUfLabel:
        [supplier.city, supplier.uf]
          .map((part) => (part ?? "").trim())
          .filter(Boolean)
          .join(" / ") || "—",
      paymentTermsLabel: supplier.paymentTerms?.trim() || "A combinar",
    },
    items: source.items.map((item) => {
      const additionalCosts = item.additionalCosts ?? [];
      const additionalTotal = additionalCosts.reduce((sum, cost) => sum + Number(cost.amount), 0);
      return {
        sku: item.sku,
        description: item.productDescriptionSnapshot,
        quantityLabel: `${formatQuantityBR(item.quantityOrdered)} ${
          unitLabels[item.unit] ?? item.unit
        }`,
        unitPriceLabel: formatMoneyBR(item.unitPrice),
        discountLabel: Number(item.discountAmount) ? formatMoneyBR(item.discountAmount) : "—",
        additionalCostsLabel: additionalTotal ? formatMoneyBR(additionalTotal) : "—",
        additionalCostsDetail: additionalCosts
          .map((cost) => `${cost.description}: ${formatMoneyBR(cost.amount)}`)
          .join(" · "),
        lineTotalLabel: formatMoneyBR(item.lineTotal),
        notes: item.notes?.trim() || null,
      };
    }),
    totals: {
      subtotalLabel: formatMoneyBR(order.subtotal),
      discountLabel: formatMoneyBR(order.discountTotal),
      additionalCostsLabel: formatMoneyBR(order.additionalCostsTotal),
      grandTotalLabel: formatMoneyBR(order.grandTotal),
    },
    approval: {
      versionLabel: order.currentVersion > 0 ? `v${order.currentVersion}` : "—",
      hashLabel: shortApprovalHash(order.approvedVersionHash),
      approvedAtLabel: formatDateTimeBR(order.approvedAt),
    },
    homologationNotice: HOMOLOGATION_NOTICE,
    homologationDetail: HOMOLOGATION_DETAIL,
  };
}
