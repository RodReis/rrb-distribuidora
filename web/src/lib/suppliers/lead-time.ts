import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { productSupplierTerms, stockLots, suppliers } from "@/lib/db/schema";
import type { ResolvedLeadTime } from "./types";

/**
 * Resolução do lead time de um produto (LAC-02).
 *
 * Regra da SPEC: o lead time específico do par produto × fornecedor prevalece sobre
 * o lead time geral do cadastro M0. Ausência de dado retorna `unknown` — nunca o
 * default numérico que o código usava antes (`15` no motor preditivo do M2).
 *
 * M2 continua exibindo seu primeiro lote como estimativa com origem. Esta resolução
 * de negócio ignora esse atalho quando não há preferência de fornecedor.
 */

export interface LeadTimeTermSnapshot {
  id: string;
  productId: string;
  supplierId: string;
  preferred: boolean;
  leadTimeDays: number | null;
  validFrom: Date;
  validUntil: Date | null;
}

export interface LeadTimeSupplierSnapshot {
  id: string;
  leadTimeDays: number | null;
}

export interface LeadTimeSnapshotSources {
  /** Condições cadastradas (vigentes e históricas) dos produtos consultados. */
  terms: LeadTimeTermSnapshot[];
  /** Cadastro de fornecedores do tenant. */
  suppliers: LeadTimeSupplierSnapshot[];
  /** Fornecedor do primeiro lote do produto (regra legada do M2), por produto. */
  legacySupplierByProduct: Map<string, string | null>;
}

export type LeadTimeResolver = (productId: string) => ResolvedLeadTime;

const UNAVAILABLE: ResolvedLeadTime = {
  days: null,
  source: "unavailable",
  preferredSupplierId: null,
  termId: null,
};

/** Aceita apenas inteiro positivo; zero/negativo/nulo = ausência de dado. */
export function normalizeLeadTimeDays(value: unknown): number | null {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return null;
  return Math.round(days);
}

function isActive(term: LeadTimeTermSnapshot, now: Date): boolean {
  return (
    term.validFrom.getTime() <= now.getTime() &&
    (term.validUntil === null || term.validUntil.getTime() > now.getTime())
  );
}

/** Condições vigentes do produto, da mais recente para a mais antiga. */
function activeTermsOf(terms: LeadTimeTermSnapshot[], productId: string, now: Date) {
  return terms
    .filter((term) => term.productId === productId && isActive(term, now))
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
}

/**
 * Resolve o lead time de planejamento do produto:
 * 1. condição vigente do fornecedor preferido com lead time específico;
 * 2. lead time geral do cadastro do fornecedor preferido;
 * 3. estimativa legada do primeiro lote, rotulada como tal até migração/validação;
 * 4. `unknown` sem nenhuma fonte numérica disponível.
 */
export function buildLeadTimeResolver(
  sources: LeadTimeSnapshotSources,
  options: { now?: Date } = {}
): LeadTimeResolver {
  const now = options.now ?? new Date();
  const supplierIndex = new Map(sources.suppliers.map((supplier) => [supplier.id, supplier]));
  const daysOfSupplier = (supplierId: string): number | null =>
    normalizeLeadTimeDays(supplierIndex.get(supplierId)?.leadTimeDays);

  return (productId: string): ResolvedLeadTime => {
    const active = activeTermsOf(sources.terms, productId, now);
    const preferred = active.find((term) => term.preferred) ?? null;

    if (preferred) {
      const specific = normalizeLeadTimeDays(preferred.leadTimeDays);
      if (specific !== null) {
        return {
          days: specific,
          source: "product_supplier_term",
          preferredSupplierId: preferred.supplierId,
          termId: preferred.id,
        };
      }

      const fromRecord = daysOfSupplier(preferred.supplierId);
      if (fromRecord !== null) {
        return {
          days: fromRecord,
          source: "supplier_record",
          preferredSupplierId: preferred.supplierId,
          termId: preferred.id,
        };
      }

      return {
        days: null,
        source: "unavailable",
        preferredSupplierId: preferred.supplierId,
        termId: preferred.id,
      };
    }

    const legacySupplierId = sources.legacySupplierByProduct.get(productId) ?? null;
    if (legacySupplierId) {
      const legacyDays = daysOfSupplier(legacySupplierId);
      if (legacyDays !== null) {
        return {
          days: legacyDays,
          source: "legacy_first_lot",
          preferredSupplierId: null,
          termId: null,
        };
      }
    }
    return UNAVAILABLE;
  };
}

/**
 * Resolve o lead time de um par produto × fornecedor específico (usado pela API de
 * condições e pelo painel de desempenho): condição vigente do par, depois cadastro
 * do fornecedor, depois `unknown`.
 */
export function resolveSupplierLeadTimeFromSnapshots(input: {
  productId: string;
  supplierId: string;
  terms: LeadTimeTermSnapshot[];
  suppliers: LeadTimeSupplierSnapshot[];
  now?: Date;
}): ResolvedLeadTime {
  const now = input.now ?? new Date();
  const active = activeTermsOf(input.terms, input.productId, now);
  const term = active.find((candidate) => candidate.supplierId === input.supplierId) ?? null;
  const supplier = input.suppliers.find((candidate) => candidate.id === input.supplierId) ?? null;

  if (term) {
    const specific = normalizeLeadTimeDays(term.leadTimeDays);
    if (specific !== null) {
      return {
        days: specific,
        source: "product_supplier_term",
        preferredSupplierId: term.preferred ? term.supplierId : null,
        termId: term.id,
      };
    }
  }

  const fromRecord = normalizeLeadTimeDays(supplier?.leadTimeDays);
  if (fromRecord !== null) {
    return {
      days: fromRecord,
      source: "supplier_record",
      preferredSupplierId: term?.preferred ? term.supplierId : null,
      termId: term?.id ?? null,
    };
  }

  return {
    days: null,
    source: "unavailable",
    preferredSupplierId: term?.preferred ? term.supplierId : null,
    termId: term?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Carga a partir do banco (motor preditivo do M2, APIs e painéis)
// ---------------------------------------------------------------------------

/**
 * Carrega, em lote, as fontes de lead time do tenant. Evita N+1 no recálculo do
 * motor preditivo (uma consulta por tabela em vez de uma por produto).
 *
 * Legado: primeiro lote **com fornecedor** por `entry_date` ascendente — a mesma
 * intenção da regra do M2, agora determinística (`lots[0]` sem ORDER BY antes).
 */
export async function loadLeadTimeSnapshotSources(input: {
  tenantId: string;
  productIds: string[];
}): Promise<LeadTimeSnapshotSources> {
  const productIds = Array.from(new Set(input.productIds));
  if (productIds.length === 0) {
    return { terms: [], suppliers: [], legacySupplierByProduct: new Map() };
  }

  const [termRows, supplierRows, lotRows] = await Promise.all([
    db
      .select({
        id: productSupplierTerms.id,
        productId: productSupplierTerms.productId,
        supplierId: productSupplierTerms.supplierId,
        preferred: productSupplierTerms.preferred,
        leadTimeDays: productSupplierTerms.leadTimeDays,
        validFrom: productSupplierTerms.validFrom,
        validUntil: productSupplierTerms.validUntil,
      })
      .from(productSupplierTerms)
      .where(
        and(
          eq(productSupplierTerms.tenantId, input.tenantId),
          inArray(productSupplierTerms.productId, productIds)
        )
      ),
    db
      .select({ id: suppliers.id, leadTimeDays: suppliers.leadTimeDays })
      .from(suppliers)
      .where(eq(suppliers.tenantId, input.tenantId)),
    db
      .select({ productId: stockLots.productId, supplierId: stockLots.supplierId })
      .from(stockLots)
      .where(
        and(
          eq(stockLots.tenantId, input.tenantId),
          inArray(stockLots.productId, productIds),
          isNotNull(stockLots.supplierId)
        )
      )
      .orderBy(asc(stockLots.entryDate)),
  ]);

  const legacySupplierByProduct = new Map<string, string | null>();
  for (const lot of lotRows) {
    if (!legacySupplierByProduct.has(lot.productId) && lot.supplierId) {
      legacySupplierByProduct.set(lot.productId, lot.supplierId);
    }
  }

  return {
    terms: termRows,
    suppliers: supplierRows,
    legacySupplierByProduct,
  };
}

/** Conveniência para uma única consulta de produto (API de condições). */
export async function loadLeadTimeSourcesForProducts(
  tenantId: string,
  productIds: string[]
): Promise<LeadTimeSnapshotSources> {
  return loadLeadTimeSnapshotSources({ tenantId, productIds });
}
