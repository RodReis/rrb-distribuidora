/**
 * Serviço de orçamentos — MVP-03.
 *
 * Toda decisão de preço, margem e bloqueio acontece aqui, no servidor.
 * As rotas apenas validam permissão e chamam este módulo.
 */

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  customers,
  machines,
  products,
  quoteItems,
  quotes,
  salesOrders,
  stockRemnants,
  tenants,
  users,
} from "@/lib/db/schema";
import {
  calculateGeometry,
  estimateCutTimeMinutes,
  inferDensityFromNorm,
  KERF_MM,
  type CutProcess,
  type GeometryResult,
} from "@/lib/metallurgy/weight-formulas";
import {
  canTransitionQuoteStatus,
  computeItemPricing,
  computeQuoteValidity,
  isQuoteExpired,
  quoteStatusLabel,
  summarizeQuote,
  type QuoteSummary,
} from "./pricing";
import { AUTO_EXPIRE_STATUSES } from "./expiry";
import { aggregateVolatility, getReplacementCosts } from "./replacement-cost";
import { createProductionOrderForSalesOrder } from "@/lib/production/service";
import type { QuoteInputPayload, QuoteItemPayload } from "./schemas";

/** Payload de precificação: tudo do orçamento, exceto o cliente. */
export type QuotePricingInput = Omit<QuoteInputPayload, "customerId" | "deliveryMethod"> & {
  /** A precificação não usa a modalidade; a prévia roda antes do preenchimento. */
  deliveryMethod?: string | null;
};

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const mmLabel = (value: string | number | null) => {
  const n = toNum(value);
  return n > 0 ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : null;
};

function geometryShortLabel(item: {
  geometryType: string;
  thicknessMm: string | number | null;
  widthMm: string | number | null;
  lengthMm: string | number | null;
  diameterMm: string | number | null;
  innerDiameterMm: string | number | null;
  wallMm: string | number | null;
}): string {
  const thickness = mmLabel(item.thicknessMm);
  switch (item.geometryType) {
    case "CHAPA_RETANGULAR":
      return [
        `${mmLabel(item.lengthMm) ?? "?"} × ${mmLabel(item.widthMm) ?? "?"} mm`,
        thickness ? `${thickness} mm` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "DISCO":
      return [
        `Ø ${mmLabel(item.diameterMm) ?? "?"} mm`,
        mmLabel(item.innerDiameterMm) ? `furo Ø ${mmLabel(item.innerDiameterMm)}` : null,
        thickness ? `${thickness} mm` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "BARRA_CORTE":
      return `Ø ${mmLabel(item.diameterMm) ?? "?"} mm · corte ${mmLabel(item.lengthMm) ?? "?"} mm`;
    case "TUBO_CORTE":
      return `Ø ${mmLabel(item.diameterMm) ?? "?"} mm · parede ${mmLabel(item.wallMm) ?? "?"} mm`;
    default:
      return "Produto de catálogo";
  }
}

export interface QuotePricingItem {
  payload: QuoteItemPayload;
  product: {
    id: string;
    sku: string;
    commercialDescription: string;
    norm: string;
    family: string;
    thicknessMm: number | null;
    weightPerUnit: number;
  };
  geometry: GeometryResult;
  /** Dimensões efetivamente usadas no cálculo (payload ou padrão do produto). */
  resolvedDims: {
    thicknessMm: number;
    widthMm: number | null;
    lengthMm: number | null;
    diameterMm: number | null;
    innerDiameterMm: number | null;
    wallMm: number | null;
  };
  thicknessMm: number;
  replacementCostPerKg: number;
  marketSymbol: string;
  machineCostPerHour: number;
  machineName: string | null;
  setupMinutes: number;
  cutMinutes: number;
  totalMinutes: number;
  unitMaterialCost: number;
  unitProcessCost: number;
  unitPrice: number;
  unitCost: number;
  itemMarginPct: number;
  totalItemAmount: number;
  totalMaterialCost: number;
  totalProcessCost: number;
  belowReplacementCost: boolean;
  belowTargetMargin: boolean;
  usedRemnant: boolean;
  remnantCode: string | null;
  processType: CutProcess;
}

interface PricingContext {
  tenantId: string;
  targetMarginPct: number;
  discountPct: number;
  minMarginPct: number;
  quoteId?: string;
}

export interface ResolvedPricing {
  items: QuotePricingItem[];
  summary: QuoteSummary;
  volatilityPct: number;
  validUntil: Date;
  validityHours: number;
  blocked: boolean;
  marketSymbol: string | null;
  replacedByDirector: boolean;
}

function processFromMachineType(type?: string | null): CutProcess {
  switch (type) {
    case "laser":
    case "plasma":
    case "oxicorte":
    case "serra":
    case "guilhotina":
    case "dobra":
      return type;
    default:
      return "laser";
  }
}

async function loadCatalog(tenantId: string, payload: QuotePricingInput) {
  const productIds = Array.from(new Set(payload.items.map((item) => item.productId)));
  const machineIds = Array.from(
    new Set(payload.items.map((item) => item.machineId).filter((id): id is string => !!id))
  );
  const remnantIds = Array.from(
    new Set(payload.items.map((item) => item.remnantId).filter((id): id is string => !!id))
  );

  const [productRows, machineRows, remnantRows, replacementCosts] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds))),
    machineIds.length
      ? db
          .select()
          .from(machines)
          .where(and(eq(machines.tenantId, tenantId), inArray(machines.id, machineIds)))
      : Promise.resolve([]),
    remnantIds.length
      ? db
          .select()
          .from(stockRemnants)
          .where(and(eq(stockRemnants.tenantId, tenantId), inArray(stockRemnants.id, remnantIds)))
      : Promise.resolve([]),
    getReplacementCosts(tenantId, productIds),
  ]);

  return {
    products: new Map(productRows.map((row) => [row.id, row])),
    machines: new Map(machineRows.map((row) => [row.id, row])),
    remnants: new Map(remnantRows.map((row) => [row.id, row])),
    replacementCosts,
  };
}

export async function priceQuoteItems(
  context: PricingContext,
  payload: QuotePricingInput
): Promise<ResolvedPricing> {
  const catalog = await loadCatalog(context.tenantId, payload);
  const items: QuotePricingItem[] = [];

  for (const item of payload.items) {
    const product = catalog.products.get(item.productId);
    if (!product) {
      throw new Error("Produto do orçamento não encontrado neste tenant.");
    }

    const remnant = item.remnantId ? catalog.remnants.get(item.remnantId) : null;
    if (item.remnantId && !remnant) {
      throw new Error("Retalho selecionado não existe neste tenant.");
    }
    if (
      remnant &&
      remnant.status !== "disponivel" &&
      remnant.reservedForQuoteId !== context.quoteId
    ) {
      throw new Error(`O retalho ${remnant.code} já não está disponível.`);
    }

    const machine = item.machineId ? catalog.machines.get(item.machineId) : null;
    if (item.machineId && !machine) {
      throw new Error("Máquina selecionada não existe neste tenant.");
    }

    const process = item.processType ?? processFromMachineType(machine?.type);
    const kerfMm = KERF_MM[process];

    const thicknessMm = item.thicknessMm ?? toNum(product.thicknessMm);
    const widthMm = item.widthMm ?? toNum(product.widthMm);
    const lengthMm = item.lengthMm ?? toNum(product.lengthMm);
    const diameterMm = item.diameterMm ?? toNum(product.diameterMm);
    const wallMm = item.wallMm ?? toNum(product.wallMm);

    const density =
      toNum(product.densityGCm3) > 0
        ? toNum(product.densityGCm3)
        : inferDensityFromNorm(product.norm, product.family);

    const geometry = calculateGeometry({
      geometryType: item.geometryType,
      thicknessMm: thicknessMm > 0 ? thicknessMm : null,
      widthMm: widthMm > 0 ? widthMm : null,
      lengthMm: lengthMm > 0 ? lengthMm : null,
      diameterMm: diameterMm > 0 ? diameterMm : null,
      innerDiameterMm: item.innerDiameterMm,
      wallMm: wallMm > 0 ? wallMm : null,
      weightPerUnitKg: toNum(product.weightPerUnit) || null,
      densityGCm3: density,
      kerfMm,
      quantity: item.quantity,
    });

    const setupMinutes = Math.max(0, item.setupMinutes ?? machine?.setupMin ?? 0);
    const cut = estimateCutTimeMinutes({
      process,
      cutPathTotalMm: geometry.cutPathTotalMm,
      quantity: geometry.quantity,
      thicknessMm,
      setupMinutes,
    });

    const machineCostPerHour = toNum(machine?.costPerHour);
    const replacementInfo = catalog.replacementCosts[product.id];
    const replacement = replacementInfo?.replacementCostPerKg ?? 0;

    const pricing = computeItemPricing({
      quantity: geometry.quantity,
      netWeightKg: geometry.netWeightPerPieceKg,
      grossWeightKg: geometry.grossWeightPerPieceKg,
      replacementCostPerKg: replacement,
      targetMarginPct: context.targetMarginPct,
      processMinutesPerPiece: cut.totalMinutes / geometry.quantity,
      machineCostPerHour,
      manualUnitPrice: item.manualUnitPrice ?? null,
      discountPct: context.discountPct,
      remnant: remnant
        ? {
            weightKg: toNum(remnant.weightKg),
            costPerKg: round(replacement * 0.65, 4),
          }
        : null,
    });

    items.push({
      payload: item,
      product: {
        id: product.id,
        sku: product.sku,
        commercialDescription: product.commercialDescription,
        norm: product.norm,
        family: product.family,
        thicknessMm: toNum(product.thicknessMm) || null,
        weightPerUnit: toNum(product.weightPerUnit),
      },
      geometry,
      resolvedDims: {
        thicknessMm,
        widthMm: widthMm > 0 ? widthMm : null,
        lengthMm: lengthMm > 0 ? lengthMm : null,
        diameterMm: diameterMm > 0 ? diameterMm : null,
        innerDiameterMm: item.innerDiameterMm ?? null,
        wallMm: wallMm > 0 ? wallMm : null,
      },
      thicknessMm,
      replacementCostPerKg: replacement,
      marketSymbol: replacementInfo?.marketSymbol ?? "CME-HRC",
      machineCostPerHour,
      machineName: machine?.name ?? null,
      setupMinutes: cut.setupMinutes,
      cutMinutes: cut.cutMinutes,
      totalMinutes: cut.totalMinutes,
      unitMaterialCost: pricing.unitMaterialCost,
      unitProcessCost: pricing.unitProcessCost,
      unitPrice: pricing.unitPrice,
      unitCost: pricing.unitCost,
      itemMarginPct: pricing.itemMarginPct,
      totalItemAmount: pricing.totalItemAmount,
      totalMaterialCost: pricing.totalMaterialCost,
      totalProcessCost: pricing.totalProcessCost,
      belowReplacementCost: pricing.belowReplacementCost,
      belowTargetMargin: pricing.belowTargetMargin,
      usedRemnant: pricing.usedRemnant,
      remnantCode: remnant?.code ?? null,
      processType: process,
    });
  }

  const summary = summarizeQuote({
    items: items.map((item) => ({
      totalMaterialCost: item.totalMaterialCost,
      totalProcessCost: item.totalProcessCost,
      totalItemAmount: item.totalItemAmount,
      itemMarginPct: item.itemMarginPct,
      belowReplacementCost: item.belowReplacementCost,
    })),
    freightCost: payload.freightCost,
    servicesCost: payload.servicesCost,
    minMarginPct: context.minMarginPct,
  });

  const volatilityPct = aggregateVolatility(
    payload.items
      .map((item) => catalog.replacementCosts[item.productId])
      .filter((value): value is NonNullable<typeof value> => !!value)
  );

  const validity = computeQuoteValidity(volatilityPct);

  return {
    items,
    summary,
    volatilityPct,
    validUntil: validity.validUntil,
    validityHours: validity.hours,
    blocked: summary.blocked,
    marketSymbol: items[0]?.marketSymbol ?? null,
    replacedByDirector: false,
  };
}

async function tenantPolicy(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Tenant inválido.");
  return {
    minMarginPct: toNum(tenant.minGrossMarginPct) || 18,
    defaultMarginPct: toNum(tenant.defaultQuoteMarginPct) || 24,
  };
}

/** Política comercial do tenant (margem mínima e margem padrão). */
export async function getTenantQuotePolicy(tenantId: string) {
  return tenantPolicy(tenantId);
}

export interface QuotePreviewItem {
  index: number;
  sku: string;
  description: string;
  norm: string;
  family: string;
  geometryType: string;
  geometryLabel: string;
  quantity: number;
  netWeightKg: number;
  grossWeightKg: number;
  scrapPct: number;
  unitMaterialCost: number;
  unitProcessCost: number;
  unitCost: number;
  unitPrice: number;
  itemMarginPct: number;
  totalItemAmount: number;
  totalMaterialCost: number;
  totalProcessCost: number;
  replacementCostPerKg: number;
  salePricePerKg: number;
  marketSymbol: string;
  processType: string;
  machineName: string | null;
  setupMinutes: number;
  cutMinutes: number;
  totalMinutes: number;
  belowReplacementCost: boolean;
  belowTargetMargin: boolean;
  usedRemnant: boolean;
  remnantCode: string | null;
}

export interface QuotePreview {
  items: QuotePreviewItem[];
  summary: QuoteSummary;
  volatilityPct: number;
  validUntil: string;
  validityHours: number;
  blocked: boolean;
  blockReasons: string[];
  minMarginPct: number;
}

/** Converte o resultado interno em um payload seguro para a UI. */
export function serializeQuotePricing(
  pricing: ResolvedPricing,
  minMarginPct: number
): QuotePreview {
  return {
    items: pricing.items.map((item, index) => ({
      index,
      sku: item.product.sku,
      description: item.product.commercialDescription,
      norm: item.product.norm,
      family: item.product.family,
      geometryType: item.geometry.geometryType,
      geometryLabel: item.geometry.dimensionsLabel,
      quantity: item.geometry.quantity,
      netWeightKg: item.geometry.netWeightKg,
      grossWeightKg: item.geometry.grossWeightKg,
      scrapPct: item.geometry.scrapPct,
      unitMaterialCost: item.unitMaterialCost,
      unitProcessCost: item.unitProcessCost,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      itemMarginPct: item.itemMarginPct,
      totalItemAmount: item.totalItemAmount,
      totalMaterialCost: item.totalMaterialCost,
      totalProcessCost: item.totalProcessCost,
      replacementCostPerKg: item.replacementCostPerKg,
      salePricePerKg:
        item.geometry.netWeightKg > 0
          ? round(item.totalItemAmount / item.geometry.netWeightKg, 2)
          : 0,
      marketSymbol: item.marketSymbol,
      processType: item.processType,
      machineName: item.machineName,
      setupMinutes: item.setupMinutes,
      cutMinutes: item.cutMinutes,
      totalMinutes: item.totalMinutes,
      belowReplacementCost: item.belowReplacementCost,
      belowTargetMargin: item.belowTargetMargin,
      usedRemnant: item.usedRemnant,
      remnantCode: item.remnantCode,
    })),
    summary: pricing.summary,
    volatilityPct: pricing.volatilityPct,
    validUntil: pricing.validUntil.toISOString(),
    validityHours: pricing.validityHours,
    blocked: pricing.blocked,
    blockReasons: pricing.summary.blockReasons,
    minMarginPct,
  };
}

function itemValues(quoteId: string, item: QuotePricingItem) {
  const p = item.payload;
  const dims = item.resolvedDims;
  return {
    quoteId,
    productId: item.product.id,
    remnantId: p.remnantId ?? null,
    geometryType: p.geometryType,
    thicknessMm: String(round(dims.thicknessMm, 2)),
    widthMm: dims.widthMm != null ? String(round(dims.widthMm, 2)) : null,
    lengthMm: dims.lengthMm != null ? String(round(dims.lengthMm, 2)) : null,
    diameterMm: dims.diameterMm != null ? String(round(dims.diameterMm, 2)) : null,
    innerDiameterMm: dims.innerDiameterMm != null ? String(round(dims.innerDiameterMm, 2)) : null,
    wallMm: dims.wallMm != null ? String(round(dims.wallMm, 2)) : null,
    processType: item.processType,
    quantity: item.geometry.quantity,
    netWeightKg: String(round(item.geometry.netWeightKg, 3)),
    grossWeightKg: String(round(item.geometry.grossWeightKg, 3)),
    scrapPct: String(round(item.geometry.scrapPct, 2)),
    unitMaterialCost: String(round(item.unitMaterialCost, 4)),
    unitProcessCost: String(round(item.unitProcessCost, 4)),
    unitPrice: String(round(item.unitPrice, 2)),
    totalItemAmount: String(round(item.totalItemAmount, 2)),
    itemMarginPct: String(round(item.itemMarginPct, 2)),
    replacementCostPerKg: String(round(item.replacementCostPerKg, 4)),
    machineId: p.machineId ?? null,
    setupMinutes: String(round(item.setupMinutes, 2)),
    estimatedCutTimeMinutes: String(round(item.totalMinutes, 2)),
  };
}

type QuoteTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function syncRemnantReservations(
  client: QuoteTx,
  tenantId: string,
  quoteId: string,
  userId: string,
  desiredRemnantIds: string[]
) {
  const desired = new Set(desiredRemnantIds);

  const reserved = await client
    .select()
    .from(stockRemnants)
    .where(
      and(eq(stockRemnants.tenantId, tenantId), eq(stockRemnants.reservedForQuoteId, quoteId))
    );

  for (const remnant of reserved) {
    if (remnant.status === "reservado" && !desired.has(remnant.id)) {
      await client
        .update(stockRemnants)
        .set({ status: "disponivel", reservedForQuoteId: null, updatedAt: new Date() })
        .where(eq(stockRemnants.id, remnant.id));
      await client.insert(auditLog).values({
        tenantId,
        userId,
        entity: "stock_remnants",
        entityId: remnant.id,
        action: "update",
        before: { status: remnant.status, quoteId },
        after: { status: "disponivel" },
      });
    }
  }

  for (const remnantId of desired) {
    const [remnant] = await client
      .select()
      .from(stockRemnants)
      .where(and(eq(stockRemnants.id, remnantId), eq(stockRemnants.tenantId, tenantId)))
      .limit(1)
      .for("update");

    if (!remnant) continue;
    if (remnant.status === "consumido") {
      throw new Error(`O retalho ${remnant.code} já foi consumido por outro pedido.`);
    }
    if (remnant.status === "descarte") {
      throw new Error(`O retalho ${remnant.code} está marcado para descarte.`);
    }
    if (remnant.status === "reservado" && remnant.reservedForQuoteId === quoteId) continue;
    if (remnant.status === "reservado") {
      throw new Error(`O retalho ${remnant.code} já está reservado para outro orçamento.`);
    }

    await client
      .update(stockRemnants)
      .set({ status: "reservado", reservedForQuoteId: quoteId, updatedAt: new Date() })
      .where(eq(stockRemnants.id, remnantId));
    await client.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_remnants",
      entityId: remnantId,
      action: "update",
      before: { status: "disponivel" },
      after: { status: "reservado", quoteId },
    });
  }
}

/**
 * Devolve ao estoque os retalhos reservados por um orçamento encerrado.
 * Usado quando a proposta é perdida, expira ou é reaberta sem o item.
 */
async function releaseQuoteRemnants(
  tenantId: string,
  quoteId: string,
  userId: string | null,
  reason: string
) {
  const rows = await db
    .select()
    .from(stockRemnants)
    .where(
      and(
        eq(stockRemnants.tenantId, tenantId),
        eq(stockRemnants.reservedForQuoteId, quoteId),
        eq(stockRemnants.status, "reservado")
      )
    );

  for (const remnant of rows) {
    await db
      .update(stockRemnants)
      .set({ status: "disponivel", reservedForQuoteId: null, updatedAt: new Date() })
      .where(eq(stockRemnants.id, remnant.id));
    await db.insert(auditLog).values({
      tenantId,
      userId,
      entity: "stock_remnants",
      entityId: remnant.id,
      action: "update",
      before: { status: "reservado", quoteId },
      after: { status: "disponivel", reason },
    });
  }

  return rows.length;
}

export interface SaveQuoteOptions {
  tenantId: string;
  userId: string;
  payload: QuoteInputPayload;
}

export async function createQuote({ tenantId, userId, payload }: SaveQuoteOptions) {
  const policy = await tenantPolicy(tenantId);
  const effectiveTargetMargin = payload.targetMarginPct || policy.defaultMarginPct;

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, payload.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);
  if (!customer) throw new Error("Cliente não encontrado neste tenant.");

  const pricing = await priceQuoteItems(
    {
      tenantId,
      targetMarginPct: effectiveTargetMargin,
      discountPct: payload.discountPct,
      minMarginPct: policy.minMarginPct,
    },
    payload
  );

  const status = pricing.blocked ? "bloqueado_margem" : "rascunho";
  const remnantIds = payload.items.map((item) => item.remnantId).filter((id): id is string => !!id);

  const quote = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(quotes)
      .values({
        tenantId,
        customerId: payload.customerId,
        sellerId: userId,
        channel: payload.channel,
        status,
        totalMaterialCost: String(round(pricing.summary.totalMaterialCost, 2)),
        totalProcessCost: String(round(pricing.summary.totalProcessCost, 2)),
        totalFreightCost: String(round(pricing.summary.totalFreightCost, 2)),
        totalServicesCost: String(round(pricing.summary.totalServicesCost, 2)),
        totalAmount: String(round(pricing.summary.totalAmount, 2)),
        grossMarginPct: String(round(pricing.summary.grossMarginPct, 2)),
        minMarginPct: String(round(policy.minMarginPct, 2)),
        targetMarginPct: String(round(effectiveTargetMargin, 2)),
        discountPct: String(round(payload.discountPct, 2)),
        marketSymbol: pricing.marketSymbol,
        marketVolatilityPct: String(round(pricing.volatilityPct, 2)),
        validUntil: pricing.validUntil,
        paymentTerms: payload.paymentTerms ?? null,
        deliveryMethod: payload.deliveryMethod ?? null,
        deliveryDeadline: payload.deliveryDeadline ? new Date(payload.deliveryDeadline) : null,
        bankingInfo: payload.bankingInfo ?? null,
        notes: payload.notes ?? null,
      })
      .returning();

    if (pricing.items.length) {
      await tx.insert(quoteItems).values(pricing.items.map((item) => itemValues(created.id, item)));
    }

    await tx.insert(auditLog).values({
      tenantId,
      userId,
      entity: "quotes",
      entityId: created.id,
      action: "insert",
      after: {
        quoteNumber: created.quoteNumber,
        status,
        totalAmount: pricing.summary.totalAmount,
        grossMarginPct: pricing.summary.grossMarginPct,
      },
    });

    await syncRemnantReservations(tx, tenantId, created.id, userId, remnantIds);

    return created;
  });

  return getQuote(tenantId, quote.id);
}

export async function updateQuote(id: string, { tenantId, userId, payload }: SaveQuoteOptions) {
  const existing = await getQuote(tenantId, id);
  if (!existing) throw new Error("Orçamento não encontrado.");
  if (existing.salesOrder)
    throw new Error("Orçamento já convertido em pedido não pode ser editado.");
  if (existing.quote.status !== "rascunho" && existing.quote.status !== "bloqueado_margem") {
    throw new Error("Somente orçamentos em rascunho ou bloqueados por margem podem ser editados.");
  }

  const policy = await tenantPolicy(tenantId);
  const effectiveTargetMargin = payload.targetMarginPct || policy.defaultMarginPct;

  const pricing = await priceQuoteItems(
    {
      tenantId,
      targetMarginPct: effectiveTargetMargin,
      discountPct: payload.discountPct,
      minMarginPct: policy.minMarginPct,
      quoteId: id,
    },
    payload
  );

  const status = pricing.blocked ? "bloqueado_margem" : "rascunho";
  const remnantIds = payload.items.map((item) => item.remnantId).filter((id): id is string => !!id);

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        customerId: payload.customerId,
        channel: payload.channel,
        status,
        totalMaterialCost: String(round(pricing.summary.totalMaterialCost, 2)),
        totalProcessCost: String(round(pricing.summary.totalProcessCost, 2)),
        totalFreightCost: String(round(pricing.summary.totalFreightCost, 2)),
        totalServicesCost: String(round(pricing.summary.totalServicesCost, 2)),
        totalAmount: String(round(pricing.summary.totalAmount, 2)),
        grossMarginPct: String(round(pricing.summary.grossMarginPct, 2)),
        minMarginPct: String(round(policy.minMarginPct, 2)),
        targetMarginPct: String(round(effectiveTargetMargin, 2)),
        discountPct: String(round(payload.discountPct, 2)),
        marketSymbol: pricing.marketSymbol,
        marketVolatilityPct: String(round(pricing.volatilityPct, 2)),
        validUntil: pricing.validUntil,
        paymentTerms: payload.paymentTerms ?? null,
        deliveryMethod: payload.deliveryMethod ?? null,
        deliveryDeadline: payload.deliveryDeadline ? new Date(payload.deliveryDeadline) : null,
        bankingInfo: payload.bankingInfo ?? null,
        notes: payload.notes ?? null,
        approvedByDirectorId: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)));

    await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));

    if (pricing.items.length) {
      await tx.insert(quoteItems).values(pricing.items.map((item) => itemValues(id, item)));
    }

    await tx.insert(auditLog).values({
      tenantId,
      userId,
      entity: "quotes",
      entityId: id,
      action: "update",
      before: {
        status: existing.quote.status,
        totalAmount: toNum(existing.quote.totalAmount),
      },
      after: {
        status,
        totalAmount: pricing.summary.totalAmount,
        grossMarginPct: pricing.summary.grossMarginPct,
      },
    });

    await syncRemnantReservations(tx, tenantId, id, userId, remnantIds);
  });

  return getQuote(tenantId, id);
}

export interface ListQuotesFilters {
  status?: string;
  search?: string;
  channel?: string;
  page?: number;
  pageSize?: number;
}

export async function listQuotes(tenantId: string, filters: ListQuotesFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(quotes.tenantId, tenantId)];
  if (filters.status && filters.status !== "todos") {
    conditions.push(eq(quotes.status, filters.status));
  }
  if (filters.channel && filters.channel !== "todos") {
    conditions.push(eq(quotes.channel, filters.channel));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    const numeric = Number(filters.search.replace(/\D/g, ""));
    const numberMatches: SQL[] = [];
    if (Number.isFinite(numeric) && numeric > 0) {
      // O rótulo exibido é 1000 + quoteNumber; aceita as duas formas.
      numberMatches.push(eq(quotes.quoteNumber, numeric));
      if (numeric >= 1000) numberMatches.push(eq(quotes.quoteNumber, numeric - 1000));
    }
    const searchCondition = or(
      like(customers.legalName, term),
      like(customers.tradeName, term),
      ...numberMatches
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        channel: quotes.channel,
        totalAmount: quotes.totalAmount,
        grossMarginPct: quotes.grossMarginPct,
        validUntil: quotes.validUntil,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
        customerId: quotes.customerId,
        customerName: customers.legalName,
        customerTradeName: customers.tradeName,
        sellerName: users.name,
      })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .leftJoin(users, eq(users.id, quotes.sellerId))
      .where(where)
      .orderBy(desc(quotes.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(where),
  ]);

  const total = Number(totals[0]?.total ?? 0);
  const quoteIds = rows.map((row) => row.id);

  const [itemRows, orderRows] = quoteIds.length
    ? await Promise.all([
        db
          .select({
            quoteId: quoteItems.quoteId,
            quantity: quoteItems.quantity,
            geometryType: quoteItems.geometryType,
            thicknessMm: quoteItems.thicknessMm,
            widthMm: quoteItems.widthMm,
            lengthMm: quoteItems.lengthMm,
            diameterMm: quoteItems.diameterMm,
            innerDiameterMm: quoteItems.innerDiameterMm,
            wallMm: quoteItems.wallMm,
            description: products.commercialDescription,
            norm: products.norm,
            createdAt: quoteItems.createdAt,
          })
          .from(quoteItems)
          .innerJoin(products, eq(products.id, quoteItems.productId))
          .where(inArray(quoteItems.quoteId, quoteIds))
          .orderBy(asc(quoteItems.createdAt)),
        db
          .select({
            quoteId: salesOrders.quoteId,
            orderNumber: salesOrders.orderNumber,
            orderStatus: salesOrders.orderStatus,
          })
          .from(salesOrders)
          .where(inArray(salesOrders.quoteId, quoteIds)),
      ])
    : [[], []];

  const ordersByQuote = new Map(
    orderRows.filter((row) => row.quoteId).map((row) => [row.quoteId as string, row])
  );

  const summaries = new Map<
    string,
    { count: number; quantity: number; headline: string; detail: string }
  >();
  for (const item of itemRows) {
    const existing = summaries.get(item.quoteId);
    if (!existing) {
      summaries.set(item.quoteId, {
        count: 1,
        quantity: item.quantity,
        headline: `${item.quantity}x ${item.description}`,
        detail: `${geometryShortLabel(item)} · ${item.norm}`,
      });
      continue;
    }
    existing.count += 1;
    existing.quantity += item.quantity;
  }

  return {
    items: rows.map((row) => ({
      ...row,
      quoteNumberLabel: `#${1000 + row.quoteNumber}`,
      expired: isQuoteExpired(row.validUntil),
      statusLabel: quoteStatusLabel(row.status),
      summary: summaries.get(row.id) ?? {
        count: 0,
        quantity: 0,
        headline: "Sem itens",
        detail: "",
      },
      salesOrderNumber: ordersByQuote.get(row.id)?.orderNumber ?? null,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getQuote(tenantId: string, id: string) {
  const [header] = await db
    .select({
      quote: quotes,
      customer: customers,
      sellerName: users.name,
      tenantName: tenants.name,
    })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .innerJoin(tenants, eq(tenants.id, quotes.tenantId))
    .leftJoin(users, eq(users.id, quotes.sellerId))
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .limit(1);

  if (!header) return null;

  const [items, order] = await Promise.all([
    db
      .select({
        item: quoteItems,
        sku: products.sku,
        description: products.commercialDescription,
        norm: products.norm,
        family: products.family,
        machineName: machines.name,
        remnantCode: stockRemnants.code,
      })
      .from(quoteItems)
      .innerJoin(products, eq(products.id, quoteItems.productId))
      .leftJoin(machines, eq(machines.id, quoteItems.machineId))
      .leftJoin(stockRemnants, eq(stockRemnants.id, quoteItems.remnantId))
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.createdAt)),
    db
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.quoteId, id), eq(salesOrders.tenantId, tenantId)))
      .limit(1),
  ]);

  return {
    quote: header.quote,
    customer: header.customer,
    sellerName: header.sellerName,
    tenantName: header.tenantName,
    items: items.map((row) => ({
      ...row.item,
      sku: row.sku,
      description: row.description,
      norm: row.norm,
      family: row.family,
      machineName: row.machineName,
      remnantCode: row.remnantCode,
    })),
    salesOrder: order[0] ?? null,
    expired: isQuoteExpired(header.quote.validUntil),
    statusLabel: quoteStatusLabel(header.quote.status),
  };
}

export async function markQuoteLost(
  tenantId: string,
  userId: string | null,
  id: string,
  lossReason: string
) {
  if (!lossReason.trim()) throw new Error("Motivo da perda é obrigatório.");

  const current = await getQuote(tenantId, id);
  if (!current) throw new Error("Orçamento não encontrado.");
  if (current.salesOrder)
    throw new Error("Orçamento já convertido em pedido não pode ser perdido.");
  if (current.quote.status === "perdido") return current.quote;

  const [updated] = await db
    .update(quotes)
    .set({ status: "perdido", lossReason: lossReason.trim(), updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  if (!updated) throw new Error("Orçamento não encontrado.");

  const released = await releaseQuoteRemnants(tenantId, id, userId, "perdido");

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "quotes",
    entityId: id,
    action: "update",
    before: { status: current.quote.status },
    after: { status: "perdido", lossReason, releasedRemnants: released },
  });

  return updated;
}

/** `userId` nulo = ação automática do sistema (ex.: job de expiração). */
export async function changeQuoteStatus(
  tenantId: string,
  userId: string | null,
  id: string,
  status: string,
  lossReason?: string | null
) {
  if (status === "perdido") {
    return markQuoteLost(tenantId, userId, id, lossReason ?? "");
  }

  const current = await getQuote(tenantId, id);
  if (!current) throw new Error("Orçamento não encontrado.");

  if (status === "aprovado" && current.quote.status === "bloqueado_margem") {
    throw new Error(
      "Orçamento bloqueado por margem precisa de liberação do diretor antes de ser aprovado."
    );
  }
  if (current.salesOrder && status !== "aprovado") {
    throw new Error("Orçamento já convertido em pedido não pode mudar de status.");
  }
  if (!canTransitionQuoteStatus(current.quote.status, status)) {
    throw new Error(
      `Transição inválida: ${quoteStatusLabel(current.quote.status)} → ${quoteStatusLabel(status)}.`
    );
  }

  const [updated] = await db
    .update(quotes)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  // Orçamento encerrado por expiração devolve os retalhos ao estoque.
  const released =
    status === "expirado" ? await releaseQuoteRemnants(tenantId, id, userId, "expirado") : 0;

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "quotes",
    entityId: id,
    action: "update",
    before: { status: current.quote.status },
    after: { status, ...(released ? { releasedRemnants: released } : {}) },
  });

  return updated;
}

/**
 * Job: marca como `expirado` as propostas abertas ao cliente cuja validade venceu e devolve os
 * retalhos reservados. Roda para todas as empresas. Cada proposta é isolada: uma falha não
 * interrompe as demais, e fica registrada na auditoria como ação do sistema (sem usuário).
 */
export async function expireOverdueQuotes(now: Date = new Date()) {
  const overdue = await db
    .select({ id: quotes.id, tenantId: quotes.tenantId })
    .from(quotes)
    .where(and(inArray(quotes.status, [...AUTO_EXPIRE_STATUSES]), lt(quotes.validUntil, now)));

  let expired = 0;
  const errors: string[] = [];
  for (const quote of overdue) {
    try {
      await changeQuoteStatus(quote.tenantId, null, quote.id, "expirado");
      expired += 1;
    } catch (err) {
      errors.push(`${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { checked: overdue.length, expired, errors };
}

/**
 * Liberação de margem pelo diretor. Recalcula o orçamento contra a política
 * atual; se continuar bloqueado, a liberação é recusada.
 */
export async function approveQuoteMargin(tenantId: string, userId: string, id: string) {
  const current = await getQuote(tenantId, id);
  if (!current) throw new Error("Orçamento não encontrado.");
  if (current.quote.status !== "bloqueado_margem") {
    throw new Error("Este orçamento não está bloqueado por margem.");
  }

  const policy = await tenantPolicy(tenantId);
  const summary = summarizeQuote({
    items: current.items.map((item) => {
      const netPerPiece = item.quantity > 0 ? toNum(item.netWeightKg) / item.quantity : 0;
      // Mesma regra do motor: retalho é custado a 65% da reposição.
      const effectiveRate = item.remnantId
        ? toNum(item.replacementCostPerKg) * 0.65
        : toNum(item.replacementCostPerKg);
      return {
        totalMaterialCost: toNum(item.unitMaterialCost) * item.quantity,
        totalProcessCost: toNum(item.unitProcessCost) * item.quantity,
        totalItemAmount: toNum(item.totalItemAmount),
        itemMarginPct: toNum(item.itemMarginPct),
        belowReplacementCost:
          netPerPiece > 0 &&
          effectiveRate > 0 &&
          toNum(item.unitPrice) / netPerPiece < effectiveRate,
      };
    }),
    freightCost: toNum(current.quote.totalFreightCost),
    servicesCost: toNum(current.quote.totalServicesCost),
    minMarginPct: policy.minMarginPct,
  });

  // A alçada do diretor libera margem abaixo da política, mas nunca uma
  // venda abaixo do custo de reposição — esse é o piso duro da operação.
  if (summary.belowReplacementCost) {
    throw new Error(
      "Há item com preço de venda abaixo do custo de reposição. Ajuste o preço antes de solicitar liberação."
    );
  }

  const [updated] = await db
    .update(quotes)
    .set({
      status: "rascunho",
      approvedByDirectorId: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  await db.insert(auditLog).values({
    tenantId,
    userId,
    entity: "quotes",
    entityId: id,
    action: "update",
    before: { status: "bloqueado_margem" },
    after: { status: "rascunho", approvedByDirectorId: userId },
  });

  return updated;
}

export async function convertQuoteToOrder(
  tenantId: string,
  userId: string,
  id: string,
  options: { deliveryDeadline?: string | null; paymentTerms?: string | null } = {}
) {
  const current = await getQuote(tenantId, id);
  if (!current) throw new Error("Orçamento não encontrado.");
  if (current.salesOrder) throw new Error("Orçamento já foi convertido em pedido.");
  if (current.quote.status !== "aprovado") {
    throw new Error("Apenas orçamentos aprovados podem ser convertidos em pedido.");
  }

  const order = await db.transaction(async (tx) => {
    const [lockedQuote] = await tx
      .select({ id: quotes.id, status: quotes.status, customerId: quotes.customerId, totalAmount: quotes.totalAmount, deliveryDeadline: quotes.deliveryDeadline, paymentTerms: quotes.paymentTerms, quoteNumber: quotes.quoteNumber })
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
      .for("update");
    if (!lockedQuote || lockedQuote.status !== "aprovado") {
      throw new Error("Apenas orçamentos aprovados podem ser convertidos em pedido.");
    }
    const [existingOrder] = await tx
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(and(eq(salesOrders.quoteId, id), eq(salesOrders.tenantId, tenantId)))
      .limit(1);
    if (existingOrder) throw new Error("Orçamento já convertido em pedido.");

    const [created] = await tx
      .insert(salesOrders)
      .values({
        tenantId,
        quoteId: id,
        customerId: lockedQuote.customerId,
        totalAmount: lockedQuote.totalAmount,
        orderStatus: "aguardando_producao",
        deliveryDeadline: options.deliveryDeadline
          ? new Date(options.deliveryDeadline)
          : lockedQuote.deliveryDeadline,
        paymentTerms: options.paymentTerms ?? lockedQuote.paymentTerms,
        createdBy: userId,
      })
      .returning();

    const remnantIds = current.items
      .map((item) => item.remnantId)
      .filter((value): value is string => !!value);

    if (remnantIds.length) {
      const reserved = await tx
        .select({ id: stockRemnants.id })
        .from(stockRemnants)
        .where(
          and(
            eq(stockRemnants.tenantId, tenantId),
            inArray(stockRemnants.id, remnantIds),
            eq(stockRemnants.status, "reservado"),
            eq(stockRemnants.reservedForQuoteId, id)
          )
        )
        .for("update");

      if (reserved.length !== new Set(remnantIds).size) {
        throw new Error(
          "Um ou mais retalhos reservados não estão mais disponíveis. Reabra o orçamento e refaça o matching."
        );
      }
    }

    await createProductionOrderForSalesOrder(tx, {
      tenantId,
      salesOrderId: created.id,
      createdBy: userId,
    });

    await tx.insert(auditLog).values({
      tenantId,
      userId,
      entity: "sales_orders",
      entityId: created.id,
      action: "insert",
      after: {
        quoteId: id,
        quoteNumber: lockedQuote.quoteNumber,
        totalAmount: toNum(lockedQuote.totalAmount),
        reservedRemnantsForProduction: remnantIds.length,
      },
    });

    return created;
  });

  return order;
}

/** Atualiza a validade conforme a volatilidade atual (usado ao reenviar). */
export async function refreshQuoteValidity(tenantId: string, id: string, volatilityPct: number) {
  const validity = computeQuoteValidity(volatilityPct);
  const [updated] = await db
    .update(quotes)
    .set({
      validUntil: validity.validUntil,
      marketVolatilityPct: String(round(volatilityPct, 2)),
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();
  return updated;
}

/** Estatísticas do funil usadas nos KPI tiles da listagem. */
export async function getQuoteFunnel(tenantId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [rows, expiring, today, aggregate, remnantUsage, policyRow] = await Promise.all([
    db
      .select({
        status: quotes.status,
        total: count(),
        amount: sql<string>`coalesce(sum(${quotes.totalAmount}), 0)`,
      })
      .from(quotes)
      .where(eq(quotes.tenantId, tenantId))
      .groupBy(quotes.status),
    db
      .select({ total: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.tenantId, tenantId),
          inArray(quotes.status, ["enviado", "em_negociacao"]),
          gte(quotes.validUntil, now),
          lte(quotes.validUntil, new Date(now.getTime() + 2 * 86_400_000))
        )
      ),
    db
      .select({ total: count() })
      .from(quotes)
      .where(and(eq(quotes.tenantId, tenantId), gte(quotes.createdAt, startOfDay))),
    db
      .select({
        total: count(),
        avgMargin: sql<string>`coalesce(avg(${quotes.grossMarginPct}), 0)`,
        totalAmount: sql<string>`coalesce(sum(${quotes.totalAmount}), 0)`,
      })
      .from(quotes)
      .where(eq(quotes.tenantId, tenantId)),
    db
      .select({
        totalWeight: sql<string>`coalesce(sum(${quoteItems.grossWeightKg}), 0)`,
        itemCount: count(),
      })
      .from(quoteItems)
      .innerJoin(quotes, eq(quotes.id, quoteItems.quoteId))
      .where(
        and(
          eq(quotes.tenantId, tenantId),
          isNotNull(quoteItems.remnantId),
          inArray(quotes.status, ["rascunho", "enviado", "em_negociacao", "aprovado"])
        )
      ),
    db
      .select({ minMarginPct: tenants.minGrossMarginPct })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  ]);

  const byStatus = Object.fromEntries(
    rows.map((row) => [row.status, { count: Number(row.total), amount: toNum(row.amount) }])
  );

  const sum = (statuses: string[]) =>
    statuses.reduce((acc, status) => acc + (byStatus[status]?.amount ?? 0), 0);
  const totalCount = (statuses: string[]) =>
    statuses.reduce((acc, status) => acc + (byStatus[status]?.count ?? 0), 0);

  const open = sum(["rascunho", "enviado", "em_negociacao", "bloqueado_margem"]);
  const approved = sum(["aprovado"]);
  const lost = sum(["perdido", "expirado"]);
  const wonCount = byStatus["aprovado"]?.count ?? 0;
  const closedCount =
    wonCount + (byStatus["perdido"]?.count ?? 0) + (byStatus["expirado"]?.count ?? 0);

  return {
    byStatus,
    openAmount: open,
    openCount: totalCount(["rascunho", "enviado", "em_negociacao", "bloqueado_margem"]),
    approvedAmount: approved,
    approvedCount: wonCount,
    lostAmount: lost,
    lostCount: totalCount(["perdido", "expirado"]),
    blockedCount: byStatus["bloqueado_margem"]?.count ?? 0,
    expiringSoonCount: Number(expiring[0]?.total ?? 0),
    todayCount: Number(today[0]?.total ?? 0),
    averageMarginPct: round(toNum(aggregate[0]?.avgMargin), 2),
    totalQuotes: Number(aggregate[0]?.total ?? 0),
    conversionRatePct: closedCount > 0 ? round((wonCount / closedCount) * 100, 1) : 0,
    remnantWeightKg: round(toNum(remnantUsage[0]?.totalWeight), 2),
    remnantItemCount: Number(remnantUsage[0]?.itemCount ?? 0),
    minMarginPct: toNum(policyRow[0]?.minMarginPct) || 18,
  };
}
