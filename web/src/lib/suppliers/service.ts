import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  productSupplierTerms,
  products,
  purchaseOrderItems,
  purchaseOrders,
  supplierDeliveryEvents,
  suppliers,
  users,
} from "@/lib/db/schema";
import { getSupplierCapabilities, requireSupplierCapability } from "./capabilities";
import { supplierConflict, supplierNotFound, supplierValidation } from "./errors";
import { buildLeadTimeResolver, loadLeadTimeSnapshotSources } from "./lead-time";
import {
  buildSupplierPerformance,
  civilDayBounds,
  last90CivilDateRange,
  OPERATIONAL_TIME_ZONE,
  type OtifDeliverySnapshot,
} from "./otif";
import type { ProductSupplierTermDto, SupplierPerformanceDto, SupplierTermInput } from "./types";

function date(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw supplierValidation(`${label} inválida.`);
  return parsed;
}

function validateTerm(input: SupplierTermInput) {
  if (
    input.leadTimeDays !== null &&
    (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 1)
  ) {
    throw supplierValidation("Lead time deve ser inteiro positivo ou não definido.");
  }
  if (
    input.minimumOrderQty !== null &&
    (!Number.isFinite(input.minimumOrderQty) || input.minimumOrderQty <= 0)
  ) {
    throw supplierValidation("Lote mínimo deve ser positivo ou não definido.");
  }
  if ((input.minimumOrderQty === null) !== (input.unit === null)) {
    throw supplierValidation("Informe unidade apenas quando lote mínimo estiver definido.");
  }
  return { ...input, startsAt: date(input.validFrom, "Início da vigência") };
}

export async function listProductSupplierTerms(
  tenantId: string,
  role: string
): Promise<ProductSupplierTermDto[]> {
  requireSupplierCapability(role, "supplier.read");
  const rows = await db
    .select({
      term: productSupplierTerms,
      sku: products.sku,
      description: products.commercialDescription,
      supplierName: suppliers.tradeName,
      legalName: suppliers.legalName,
      changedByName: users.name,
    })
    .from(productSupplierTerms)
    .innerJoin(
      products,
      and(eq(products.id, productSupplierTerms.productId), eq(products.tenantId, tenantId))
    )
    .innerJoin(
      suppliers,
      and(eq(suppliers.id, productSupplierTerms.supplierId), eq(suppliers.tenantId, tenantId))
    )
    .leftJoin(users, eq(users.id, productSupplierTerms.changedBy))
    .where(eq(productSupplierTerms.tenantId, tenantId))
    .orderBy(asc(products.sku), asc(productSupplierTerms.validFrom));

  return rows.map(({ term, sku, description, supplierName, legalName, changedByName }) => ({
    id: term.id,
    productId: term.productId,
    sku,
    productDescription: description,
    supplierId: term.supplierId,
    supplierName: supplierName || legalName,
    preferred: term.preferred,
    leadTimeDays: term.leadTimeDays,
    minimumOrderQty: term.minimumOrderQty === null ? null : Number(term.minimumOrderQty),
    unit: term.unit,
    validFrom: term.validFrom.toISOString(),
    validUntil: term.validUntil?.toISOString() ?? null,
    changedByName,
    createdAt: term.createdAt.toISOString(),
  }));
}

export async function saveProductSupplierTerm(input: {
  tenantId: string;
  userId: string;
  role: string;
  value: SupplierTermInput;
  termId?: string;
}): Promise<ProductSupplierTermDto> {
  requireSupplierCapability(input.role, "supplier.configure_terms");
  const value = validateTerm(input.value);
  const start = value.startsAt;

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id, unit: products.unit })
      .from(products)
      .where(and(eq(products.id, value.productId), eq(products.tenantId, input.tenantId)))
      .for("update");
    if (!product) throw supplierNotFound("Produto não encontrado neste tenant.");
    // Lock da linha do produto serializa gravações concorrentes de vigência e
    // preferência para este produto sem bloquear outros produtos do tenant.
    const [supplier] = await tx
      .select({ id: suppliers.id, active: suppliers.active })
      .from(suppliers)
      .where(and(eq(suppliers.id, value.supplierId), eq(suppliers.tenantId, input.tenantId)));
    if (!supplier || !supplier.active)
      throw supplierValidation("Fornecedor inexistente ou inativo neste tenant.");
    if (value.unit && value.unit !== product.unit)
      throw supplierValidation("Unidade do lote mínimo deve coincidir com a unidade do produto.");

    const current = input.termId
      ? (
          await tx
            .select()
            .from(productSupplierTerms)
            .where(
              and(
                eq(productSupplierTerms.id, input.termId),
                eq(productSupplierTerms.tenantId, input.tenantId),
                eq(productSupplierTerms.productId, value.productId),
                isNull(productSupplierTerms.validUntil)
              )
            )
            .limit(1)
        )[0]
      : undefined;
    if (input.termId && !current) throw supplierNotFound("Condição vigente não encontrada.");
    if (current && start <= current.validFrom)
      throw supplierValidation("Nova vigência deve iniciar após a vigência atual.");
    const candidateEnd = current ? start : new Date("9999-12-31T23:59:59.999Z");
    const overlap = and(
      eq(productSupplierTerms.tenantId, input.tenantId),
      eq(productSupplierTerms.productId, value.productId),
      lt(productSupplierTerms.validFrom, candidateEnd),
      or(isNull(productSupplierTerms.validUntil), gt(productSupplierTerms.validUntil, start))
    );
    const overlapping = await tx.select().from(productSupplierTerms).where(overlap);
    const conflicts = overlapping
      .filter((term) => term.id !== input.termId)
      .filter(
        (term) =>
          (term.supplierId === value.supplierId && term.preferred === value.preferred) ||
          (value.preferred && term.preferred)
      );
    if (conflicts.length > 0) {
      throw supplierConflict(
        "A vigência conflita com condição existente para este produto e fornecedor/preferência."
      );
    }

    if (input.termId) {
      await tx
        .update(productSupplierTerms)
        .set({ validUntil: start })
        .where(eq(productSupplierTerms.id, current!.id));
    }

    const [created] = await tx
      .insert(productSupplierTerms)
      .values({
        tenantId: input.tenantId,
        productId: value.productId,
        supplierId: value.supplierId,
        preferred: value.preferred,
        leadTimeDays: value.leadTimeDays,
        minimumOrderQty: value.minimumOrderQty === null ? null : String(value.minimumOrderQty),
        unit: value.unit,
        validFrom: start,
        changedBy: input.userId,
      })
      .returning();
    const [row] = await tx
      .select({
        term: productSupplierTerms,
        sku: products.sku,
        description: products.commercialDescription,
        supplierName: suppliers.tradeName,
        legalName: suppliers.legalName,
        changedByName: users.name,
      })
      .from(productSupplierTerms)
      .innerJoin(products, eq(products.id, productSupplierTerms.productId))
      .innerJoin(suppliers, eq(suppliers.id, productSupplierTerms.supplierId))
      .leftJoin(users, eq(users.id, productSupplierTerms.changedBy))
      .where(eq(productSupplierTerms.id, created.id));
    return {
      id: row.term.id,
      productId: row.term.productId,
      sku: row.sku,
      productDescription: row.description,
      supplierId: row.term.supplierId,
      supplierName: row.supplierName || row.legalName,
      preferred: row.term.preferred,
      leadTimeDays: row.term.leadTimeDays,
      minimumOrderQty: row.term.minimumOrderQty === null ? null : Number(row.term.minimumOrderQty),
      unit: row.term.unit,
      validFrom: row.term.validFrom.toISOString(),
      validUntil: row.term.validUntil?.toISOString() ?? null,
      changedByName: row.changedByName,
      createdAt: row.term.createdAt.toISOString(),
    };
  });
}

export async function getSupplierPerformance(input: {
  tenantId: string;
  role: string;
  supplierId: string;
  from?: string;
  to?: string;
}): Promise<SupplierPerformanceDto> {
  requireSupplierCapability(input.role, "supplier.read");
  if (Boolean(input.from) !== Boolean(input.to))
    throw supplierValidation("Informe as duas datas do período.");
  const range =
    input.from && input.to ? { from: input.from, to: input.to } : last90CivilDateRange();
  date(range.from, "Data inicial");
  date(range.to, "Data final");
  const { from, to } = civilDayBounds(range.from, range.to);
  if (from > to) throw supplierValidation("Data inicial deve ser anterior à data final.");
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, input.tenantId)));
  if (!supplier) throw supplierNotFound();
  const orders = await db
    .select({
      order: purchaseOrders,
      item: purchaseOrderItems,
      productSku: products.sku,
      productDescription: products.commercialDescription,
    })
    .from(purchaseOrders)
    .leftJoin(
      purchaseOrderItems,
      and(
        eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
        eq(purchaseOrderItems.tenantId, input.tenantId)
      )
    )
    .leftJoin(
      products,
      and(eq(products.id, purchaseOrderItems.productId), eq(products.tenantId, input.tenantId))
    )
    .where(
      and(
        eq(purchaseOrders.tenantId, input.tenantId),
        eq(purchaseOrders.supplierId, input.supplierId),
        isNull(purchaseOrders.deletedAt)
      )
    );
  const orderIds = [...new Set(orders.map((row) => row.order.id))];
  const events = orderIds.length
    ? await db
        .select()
        .from(supplierDeliveryEvents)
        .where(
          and(
            eq(supplierDeliveryEvents.tenantId, input.tenantId),
            inArray(supplierDeliveryEvents.purchaseOrderId, orderIds)
          )
        )
    : [];
  const snapshots: OtifDeliverySnapshot[] = orderIds.map((id) => {
    const orderRows = orders.filter((row) => row.order.id === id);
    return {
      purchaseOrderId: id,
      number: orderRows[0].order.number,
      status: orderRows[0].order.status,
      items: orderRows
        .filter(({ item }) => item !== null)
        .map(({ item, productSku, productDescription }) => ({
          itemId: item!.id,
          quantityOrdered: Number(item!.quantityOrdered),
          label: `${productSku ?? "Item"} · ${productDescription ?? item!.productDescriptionSnapshot}`,
        })),
      events: events
        .filter((event) => event.purchaseOrderId === id)
        .map((event) => ({
          id: event.id,
          compensatesEventId: event.compensatesEventId,
          correctionReason: event.correctionReason,
          createdAt: event.createdAt.toISOString(),
          source: event.source,
          eventType: event.eventType,
          itemId: event.itemId,
          quantity: event.quantity === null ? null : Number(event.quantity),
          promisedAt: event.promisedAt?.toISOString() ?? null,
          eventAt: event.eventAt.toISOString(),
          note:
            event.eventType === "received" || event.eventType === "receipt_reversed"
              ? "Recebimento"
              : event.note,
        })),
    };
  });
  return {
    ...buildSupplierPerformance({
      supplier: {
        id: supplier.id,
        name: supplier.tradeName || supplier.legalName,
        legalName: supplier.legalName,
        active: supplier.active,
      },
      deliveries: snapshots,
      period: { from, to },
      timeZone: OPERATIONAL_TIME_ZONE,
    }),
    capabilities: getSupplierCapabilities(input.role),
  };
}

export async function correctSupplierDeliveryEvent(input: {
  tenantId: string;
  userId: string;
  role: string;
  purchaseOrderId: string;
  eventId: string;
  eventAt: string;
  promisedAt: string | null;
  itemId: string | null;
  quantity: number | null;
  reason: string;
}) {
  requireSupplierCapability(input.role, "supplier.correct_events");
  const reason = input.reason.trim();
  if (reason.length < 10)
    throw supplierValidation("Justificativa deve ter ao menos 10 caracteres.");

  const eventAt = date(input.eventAt, "Data do evento");
  if (eventAt.getTime() > Date.now())
    throw supplierValidation("Correção de evento histórico não pode usar data futura.");
  const promisedAt = input.promisedAt ? date(input.promisedAt, "Data prometida") : null;

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, input.purchaseOrderId),
          eq(purchaseOrders.tenantId, input.tenantId),
          isNull(purchaseOrders.deletedAt)
        )
      )
      .for("update");
    if (!order) throw supplierNotFound("Pedido de compra não encontrado neste tenant.");

    const [target] = await tx
      .select()
      .from(supplierDeliveryEvents)
      .where(
        and(
          eq(supplierDeliveryEvents.id, input.eventId),
          eq(supplierDeliveryEvents.tenantId, input.tenantId),
          eq(supplierDeliveryEvents.purchaseOrderId, input.purchaseOrderId)
        )
      )
      .for("update");
    if (!target) throw supplierNotFound("Evento não encontrado neste pedido.");

    const [existingCorrection] = await tx
      .select({ id: supplierDeliveryEvents.id })
      .from(supplierDeliveryEvents)
      .where(
        and(
          eq(supplierDeliveryEvents.tenantId, input.tenantId),
          eq(supplierDeliveryEvents.compensatesEventId, target.id)
        )
      )
      .limit(1);
    if (existingCorrection)
      throw supplierConflict("Este evento já foi substituído por uma correção.");

    const isPromise =
      target.eventType === "promise_confirmed" || target.eventType === "promise_revised";
    const isReceipt = target.eventType === "received" || target.eventType === "receipt_reversed";
    if (isPromise) {
      if (!promisedAt || input.itemId !== null || input.quantity !== null)
        throw supplierValidation(
          "Correção de promessa exige data prometida e não aceita item/quantidade."
        );
    } else if (isReceipt) {
      if (promisedAt || !input.itemId || !Number.isFinite(input.quantity) || input.quantity! <= 0)
        throw supplierValidation("Correção de recebimento exige item e quantidade positiva.");
      const [item] = await tx
        .select({ id: purchaseOrderItems.id })
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.id, input.itemId),
            eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId),
            eq(purchaseOrderItems.tenantId, input.tenantId)
          )
        );
      if (!item) throw supplierValidation("O item precisa pertencer ao pedido de compra.");
    } else if (promisedAt || input.itemId !== null || input.quantity !== null) {
      throw supplierValidation("Este tipo de evento aceita somente correção da data.");
    }

    const [replacement] = await tx
      .insert(supplierDeliveryEvents)
      .values({
        tenantId: input.tenantId,
        purchaseOrderId: input.purchaseOrderId,
        itemId: isReceipt ? input.itemId : target.itemId,
        eventType: target.eventType,
        promisedAt: isPromise ? promisedAt : target.promisedAt,
        eventAt,
        quantity: isReceipt ? String(input.quantity) : target.quantity,
        actorId: input.userId,
        source: "manual_correction",
        note: target.note,
        compensatesEventId: target.id,
        correctionReason: reason,
      })
      .returning();

    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      entity: "supplier_delivery_events",
      entityId: replacement.id,
      action: "insert",
      before: {
        eventId: target.id,
        eventType: target.eventType,
        eventAt: target.eventAt.toISOString(),
        promisedAt: target.promisedAt?.toISOString() ?? null,
        itemId: target.itemId,
        quantity: target.quantity,
      },
      after: {
        eventId: replacement.id,
        compensatesEventId: target.id,
        correctionReason: reason,
        eventAt: replacement.eventAt.toISOString(),
        promisedAt: replacement.promisedAt?.toISOString() ?? null,
        itemId: replacement.itemId,
        quantity: replacement.quantity,
      },
    });

    return {
      id: replacement.id,
      eventType: replacement.eventType,
      eventAt: replacement.eventAt.toISOString(),
      createdAt: replacement.createdAt.toISOString(),
      compensatesEventId: target.id,
      correctionReason: reason,
    };
  });
}

export async function getProductLeadTimes(tenantId: string, productIds: string[]) {
  const sources = await loadLeadTimeSnapshotSources({ tenantId, productIds });
  const resolve = buildLeadTimeResolver(sources);
  return Object.fromEntries(productIds.map((productId) => [productId, resolve(productId)]));
}

export async function listSupplierOptions(tenantId: string) {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.tradeName,
      legalName: suppliers.legalName,
      active: suppliers.active,
    })
    .from(suppliers)
    .where(eq(suppliers.tenantId, tenantId))
    .orderBy(asc(suppliers.tradeName));
}

export async function listProductOptions(tenantId: string) {
  return db
    .select({
      id: products.id,
      sku: products.sku,
      description: products.commercialDescription,
      unit: products.unit,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .orderBy(asc(products.sku));
}
