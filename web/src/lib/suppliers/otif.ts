import { PURCHASE_STATUS_LABEL } from "@/lib/purchases/state-machine";
import type { PurchaseStatus } from "@/lib/purchases/types";
import {
  DELIVERY_SITUATION_LABEL,
  type DeliveryEventType,
  type DeliverySituation,
  type SupplierDeliveryDto,
  type SupplierDeliveryPromiseRevision,
  type SupplierPerformanceDto,
} from "./types";

/**
 * Cálculo do OTIF (LAC-02) — funções puras, sem banco.
 *
 * Regras da SPEC e decisões aprovadas pelo PI:
 * - Entrega = pedido de compra emitido da LAC-01, com promessa confirmada pelo
 *   fornecedor registrada em `supplier_delivery_events`.
 * - Pontualidade compara a **data efetiva completa** com a **promessa original**
 *   confirmada. Reprogramações ficam registradas à parte e não apagam o atraso
 *   histórico. Reprogramação não substitui a promessa original; essa política
 *   poderá ser reavaliada pelo PI depois.
 * - Completude usa tolerância zero, conforme decisão do PI: quantidade líquida recebida de todo item
 *   precisa alcançar a pedida. Recebimento parcial não conta como entrega completa.
 * - Denominador = entregas elegíveis com promessa confirmada e data de referência
 *   dentro do período. Sem promessa, cancelada antes da promessa e promessa futura
 *   ainda não vencida ficam fora e são contadas à parte.
 * - Amostra zero → `null` ("sem dados"), nunca 0%.
 * - O recorte do período usa a data prometida original e a janela exibida é de
 *   90 dias, conforme decisão do PI.
 * - Comparação de datas é feita no fuso operacional abaixo. O relógio por tenant
 *   previsto na LAC-01 US-05 ainda não existe; quando existir, passa por opção.
 */

/** Fuso de comparação operacional definido para o indicador: horário de Brasília. */
export const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const QUANTITY_EPSILON = 1e-6;

export interface OtifDeliveryItem {
  itemId: string;
  quantityOrdered: number;
  label?: string;
}

export interface OtifDeliveryEvent {
  id?: string;
  compensatesEventId?: string | null;
  correctionReason?: string | null;
  createdAt?: string;
  source?: string | null;
  eventType: DeliveryEventType;
  itemId: string | null;
  quantity: number | null;
  promisedAt: string | null;
  eventAt: string;
  note: string | null;
}

export interface OtifDeliverySnapshot {
  purchaseOrderId: string;
  number: number | null;
  status: string;
  items: OtifDeliveryItem[];
  events: OtifDeliveryEvent[];
}

export interface OtifPeriod {
  from: Date;
  to: Date;
}

export interface OtifOptions {
  period: OtifPeriod;
  /** Injetável para teste; padrão = agora. */
  now?: Date;
  timeZone?: string;
}

export interface DeliveryEvaluation {
  purchaseOrderId: string;
  number: number | null;
  status: string;
  issuedAt: Date | null;
  promisedOriginalAt: Date | null;
  promisedCurrentAt: Date | null;
  promiseEventAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  complete: boolean;
  onTime: boolean;
  eligible: boolean;
  situation: DeliverySituation | "not_issued";
  revisions: SupplierDeliveryPromiseRevision[];
  delayDays: number | null;
  promisedLeadTimeDays: number | null;
  actualLeadTimeDays: number | null;
  itemsTotal: number;
  itemsComplete: number;
}

/** Chave de dia (`YYYY-MM-DD`) no fuso informado; base para comparar datas. */
export function dayKey(date: Date, timeZone: string = OPERATIONAL_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Dias corridos entre duas datas (comparação por dia no fuso operacional). */
export function calendarDaysBetween(
  start: Date,
  end: Date,
  timeZone: string = OPERATIONAL_TIME_ZONE
): number {
  const startUtc = Date.parse(`${dayKey(start, timeZone)}T00:00:00.000Z`);
  const endUtc = Date.parse(`${dayKey(end, timeZone)}T00:00:00.000Z`);
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

/** Interpreta data civil da interface como dia completo no fuso operacional. */
export function civilDayBounds(
  from: string,
  to: string,
  timeZone: string = OPERATIONAL_TIME_ZONE
): OtifPeriod {
  const utcParts = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const fromDate = utcParts(from);
  const toDate = utcParts(to);
  if (
    [fromDate, toDate].some((date) => Number.isNaN(date.getTime())) ||
    fromDate.toISOString().slice(0, 10) !== from ||
    toDate.toISOString().slice(0, 10) !== to ||
    from > to
  ) {
    throw new Error("Período inválido.");
  }
  const offsetFor = (instant: Date) => {
    const local =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(instant)
        .find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
    const match = local.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
    return -minutes;
  };
  fromDate.setUTCHours(0, 0, 0, 0);
  fromDate.setUTCMinutes(offsetFor(fromDate));
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  toDate.setUTCHours(0, 0, 0, 0);
  toDate.setUTCMinutes(offsetFor(toDate));
  toDate.setTime(toDate.getTime() - 1);
  return { from: fromDate, to: toDate };
}

/** Janela fixa dos últimos 90 dias civis, inclusive, no fuso operacional. */
export function last90CivilDateRange(
  now: Date = new Date(),
  timeZone: string = OPERATIONAL_TIME_ZONE
): { from: string; to: string } {
  const to = dayKey(now, timeZone);
  const [year, month, day] = to.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, day));
  firstDay.setUTCDate(firstDay.getUTCDate() - 89);
  return { from: firstDay.toISOString().slice(0, 10), to };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[], decimals = 1): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length, decimals);
}

function parseInstant(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPositive(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

interface ReceiptState {
  receivedByItem: Map<string, number>;
  completedAt: Date | null;
  historicalCompletedAt: Date | null;
  complete: boolean;
  itemsComplete: number;
}

/**
 * Simula os recebimentos/estornos em ordem cronológica para descobrir a data em que
 * a entrega ficou completa e se ela continua completa no estado atual.
 */
function simulateReceipts(items: OtifDeliveryItem[], events: OtifDeliveryEvent[]): ReceiptState {
  const ordered = new Map(items.map((item) => [item.itemId, item.quantityOrdered]));
  const receivedByItem = new Map<string, number>(items.map((item) => [item.itemId, 0]));
  let completedAt: Date | null = null;
  let historicalCompletedAt: Date | null = null;
  let complete = false;

  const isFullyReceived = () => {
    if (ordered.size === 0) return false;
    for (const [itemId, quantityOrdered] of ordered) {
      const received = receivedByItem.get(itemId) ?? 0;
      if (received + QUANTITY_EPSILON < quantityOrdered) return false;
    }
    return true;
  };

  const countCompleteItems = () => {
    let count = 0;
    for (const [itemId, quantityOrdered] of ordered) {
      const received = receivedByItem.get(itemId) ?? 0;
      if (received + QUANTITY_EPSILON >= quantityOrdered) count += 1;
    }
    return count;
  };

  const groupedReceipts = new Map<string, OtifDeliveryEvent>();
  const reversedReceiptKeys = new Set<string>();
  const receiptEvents = events.filter(
    (event) => event.eventType === "received" || event.eventType === "receipt_reversed"
  );
  for (const event of receiptEvents) {
    const receiptId = event.note?.match(/Recebimento\s+([0-9a-f-]{36})/i)?.[1];
    const key = receiptId ?? `${event.itemId}:${event.eventAt}`;
    if (event.eventType === "receipt_reversed" && receiptId) {
      const receivedEvent = events.find(
        (candidate) => candidate.eventType === "received" && candidate.note?.includes(receiptId)
      );
      if (receivedEvent) {
        groupedReceipts.set(key, receivedEvent);
        reversedReceiptKeys.add(key);
      }
      continue;
    }
    groupedReceipts.set(key, event);
  }
  const effectiveReceiptEvents = [...groupedReceipts.entries()]
    .map(([key, event]) =>
      reversedReceiptKeys.has(key) ? { ...event, eventType: "receipt_reversed" as const } : event
    )
    .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));

  for (const event of effectiveReceiptEvents) {
    if (!event.itemId || !isPositive(event.quantity)) continue;
    if (!ordered.has(event.itemId)) continue;
    const current = receivedByItem.get(event.itemId) ?? 0;
    if (event.eventType === "received")
      receivedByItem.set(event.itemId, current + Number(event.quantity));
    else receivedByItem.set(event.itemId, Math.max(0, current - Number(event.quantity)));

    const nowComplete = isFullyReceived();
    const eventAt = parseInstant(event.eventAt);
    if (nowComplete && !complete) {
      // Virada para completa: este é o instante efetivo de conclusão.
      completedAt = eventAt;
      historicalCompletedAt ??= eventAt;
    }
    if (!nowComplete && complete) {
      // Estorno desfez a conclusão: o estado atual manda (entrega volta a incompleta).
      completedAt = null;
    }
    complete = nowComplete;
  }

  return {
    receivedByItem,
    completedAt,
    historicalCompletedAt,
    complete,
    itemsComplete: countCompleteItems(),
  };
}

/** Avalia uma entrega individual (usado pelo serviço e pelos testes). */
export function evaluateDelivery(
  snapshot: OtifDeliverySnapshot,
  options: { now?: Date; timeZone?: string } = {}
): DeliveryEvaluation {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? OPERATIONAL_TIME_ZONE;

  const supersededEventIds = new Set(
    snapshot.events.flatMap((event) => (event.compensatesEventId ? [event.compensatesEventId] : []))
  );
  const events = snapshot.events
    .filter((event) => !event.id || !supersededEventIds.has(event.id))
    .sort((a, b) => {
      const diff = Date.parse(a.eventAt) - Date.parse(b.eventAt);
      return diff !== 0 ? diff : 0;
    });

  const issuedEvent = events.find((event) => event.eventType === "issued") ?? null;
  const issuedAt = issuedEvent ? parseInstant(issuedEvent.eventAt) : null;

  const promiseEvents = events
    .filter(
      (event) =>
        (event.eventType === "promise_confirmed" || event.eventType === "promise_revised") &&
        !!event.promisedAt
    )
    .map((event) => ({
      promisedAt: parseInstant(event.promisedAt),
      eventAt: parseInstant(event.eventAt),
      note: event.note,
    }))
    .filter(
      (event): event is { promisedAt: Date; eventAt: Date | null; note: string | null } =>
        event.promisedAt !== null
    )
    .filter((event) => !issuedAt || (event.eventAt !== null && event.eventAt >= issuedAt));

  const original = promiseEvents[0] ?? null;
  const current = promiseEvents[promiseEvents.length - 1] ?? null;
  const revisions: SupplierDeliveryPromiseRevision[] = promiseEvents.slice(1).flatMap((event) =>
    event.eventAt
      ? [
          {
            promisedAt: event.promisedAt.toISOString(),
            eventAt: event.eventAt.toISOString(),
            note: event.note,
          },
        ]
      : []
  );

  const cancelledEvent = events.find((event) => event.eventType === "cancelled") ?? null;
  const cancelledAt = cancelledEvent ? parseInstant(cancelledEvent.eventAt) : null;
  const isCancelled = snapshot.status === "cancelado" || cancelledEvent !== null;

  const receipts = simulateReceipts(snapshot.items, events);
  const complete = snapshot.items.length > 0 && receipts.complete;
  const completedAt = complete ? receipts.completedAt : receipts.historicalCompletedAt;

  const promisedOriginalAt = original?.promisedAt ?? null;
  const promiseEventAt = original?.eventAt ?? null;
  const promisedCurrentAt = current?.promisedAt ?? null;

  const promisedBeforeCancel =
    promisedOriginalAt !== null &&
    (!isCancelled ||
      cancelledAt === null ||
      (promiseEventAt !== null && promiseEventAt.getTime() <= cancelledAt.getTime()));

  const onTime =
    complete &&
    completedAt !== null &&
    promisedOriginalAt !== null &&
    dayKey(completedAt, timeZone) <= dayKey(promisedOriginalAt, timeZone);

  let situation: DeliverySituation | "not_issued";
  let eligible = false;

  if (!issuedAt) {
    situation = "not_issued";
  } else if (isCancelled && !promisedBeforeCancel) {
    situation = "cancelled_before_promise";
  } else if (promisedOriginalAt === null) {
    situation = "no_promise";
  } else if (!complete && promisedOriginalAt.getTime() > now.getTime()) {
    situation = "in_progress";
  } else {
    eligible = true;
    situation = complete ? (onTime ? "otif" : "late") : "incomplete";
  }

  const delayDays =
    complete && completedAt && promisedOriginalAt
      ? calendarDaysBetween(promisedOriginalAt, completedAt, timeZone)
      : null;
  const promisedLeadTimeDays =
    issuedAt && promisedOriginalAt
      ? calendarDaysBetween(issuedAt, promisedOriginalAt, timeZone)
      : null;
  const actualLeadTimeDays =
    issuedAt && completedAt ? calendarDaysBetween(issuedAt, completedAt, timeZone) : null;

  return {
    purchaseOrderId: snapshot.purchaseOrderId,
    number: snapshot.number,
    status: snapshot.status,
    issuedAt,
    promisedOriginalAt,
    promisedCurrentAt,
    promiseEventAt,
    cancelledAt,
    completedAt,
    complete,
    onTime,
    eligible,
    situation,
    revisions,
    delayDays,
    promisedLeadTimeDays,
    actualLeadTimeDays,
    itemsTotal: snapshot.items.length,
    itemsComplete: receipts.itemsComplete,
  };
}

export function purchaseNumberLabel(number: number | null | undefined): string {
  if (!number) return "Rascunho";
  return `#PC-${String(number).padStart(4, "0")}`;
}

export interface OtifSummaryInput {
  deliveries: OtifDeliverySnapshot[];
  period: OtifPeriod;
  now?: Date;
  timeZone?: string;
}

export interface OtifSummary {
  eligibleCount: number;
  otifCount: number;
  onTimeCount: number;
  completeCount: number;
  lateCount: number;
  incompleteCount: number;
  otifPct: number | null;
  excluded: { noPromise: number; cancelledBeforePromise: number; inProgress: number };
  observedLeadTimeDays: number | null;
  promisedLeadTimeDays: number | null;
  averageDelayDays: number | null;
  revisedPromiseCount: number;
  deliveries: SupplierDeliveryDto[];
}

function periodIncludes(date: Date | null, period: OtifPeriod, timeZone: string): boolean {
  if (!date) return false;
  const key = dayKey(date, timeZone);
  const fromKey = dayKey(period.from, timeZone);
  const toKey = dayKey(period.to, timeZone);
  return key >= fromKey && key <= toKey;
}

/** Avaliação do desempenho de um fornecedor no período (parte pura do painel). */
export function computeOtifSummary(input: OtifSummaryInput): OtifSummary {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? OPERATIONAL_TIME_ZONE;

  const evaluated = input.deliveries
    .map((snapshot) => evaluateDelivery(snapshot, { now, timeZone }))
    .filter((evaluation) => evaluation.situation !== "not_issued")
    // Referência do período: promessa original; sem promessa, o cancelamento ou a emissão.
    .filter((evaluation) => {
      const reference =
        evaluation.promisedOriginalAt ?? evaluation.cancelledAt ?? evaluation.issuedAt;
      return periodIncludes(reference, input.period, timeZone);
    });

  const eligible = evaluated.filter((evaluation) => evaluation.eligible);
  const otifCount = eligible.filter((evaluation) => evaluation.situation === "otif").length;
  const lateCount = eligible.filter((evaluation) => evaluation.situation === "late").length;
  const incompleteCount = eligible.filter(
    (evaluation) => evaluation.situation === "incomplete"
  ).length;
  const onTimeCount = eligible.filter((evaluation) => evaluation.onTime).length;
  const completeCount = eligible.filter((evaluation) => evaluation.complete).length;
  const snapshotByOrderId = new Map(
    input.deliveries.map((snapshot) => [snapshot.purchaseOrderId, snapshot])
  );
  const supersededEventIds = new Set(
    input.deliveries.flatMap((snapshot) =>
      snapshot.events.flatMap((event) =>
        event.compensatesEventId ? [event.compensatesEventId] : []
      )
    )
  );

  const deliveries: SupplierDeliveryDto[] = evaluated
    .map((evaluation) => {
      const snapshot = snapshotByOrderId.get(evaluation.purchaseOrderId)!;
      return {
        purchaseOrderId: evaluation.purchaseOrderId,
        number: evaluation.number,
        numberLabel: purchaseNumberLabel(evaluation.number),
        status: evaluation.status,
        statusLabel:
          PURCHASE_STATUS_LABEL[evaluation.status as PurchaseStatus] ?? evaluation.status,
        issuedAt: evaluation.issuedAt?.toISOString() ?? "",
        promisedOriginalAt: evaluation.promisedOriginalAt?.toISOString() ?? null,
        promisedCurrentAt: evaluation.promisedCurrentAt?.toISOString() ?? null,
        completedAt: evaluation.completedAt?.toISOString() ?? null,
        promisedLeadTimeDays: evaluation.promisedLeadTimeDays,
        actualLeadTimeDays: evaluation.actualLeadTimeDays,
        delayDays: evaluation.delayDays,
        complete: evaluation.complete,
        onTime: evaluation.onTime,
        situation: evaluation.situation as DeliverySituation,
        situationLabel: DELIVERY_SITUATION_LABEL[evaluation.situation as DeliverySituation],
        revisions: evaluation.revisions,
        items: snapshot.items.map((item) => ({
          id: item.itemId,
          label: item.label ?? item.itemId,
          quantityOrdered: item.quantityOrdered,
        })),
        events: snapshot.events.map((event) => ({
          id: event.id ?? `${snapshot.purchaseOrderId}:${event.eventType}:${event.eventAt}`,
          eventType: event.eventType,
          eventAt: event.eventAt,
          createdAt: event.createdAt ?? event.eventAt,
          promisedAt: event.promisedAt,
          itemId: event.itemId,
          itemLabel: snapshot.items.find((item) => item.itemId === event.itemId)?.label ?? null,
          quantity: event.quantity,
          note: event.note,
          source: event.source ?? null,
          correctionReason: event.correctionReason ?? null,
          compensatesEventId: event.compensatesEventId ?? null,
          corrected: event.id ? supersededEventIds.has(event.id) : false,
        })),
        itemsTotal: evaluation.itemsTotal,
        itemsComplete: evaluation.itemsComplete,
      };
    })
    .sort((a, b) => {
      const left = a.promisedOriginalAt ?? a.issuedAt;
      const right = b.promisedOriginalAt ?? b.issuedAt;
      return right.localeCompare(left);
    });

  return {
    eligibleCount: eligible.length,
    otifCount,
    onTimeCount,
    completeCount,
    lateCount,
    incompleteCount,
    // Sem dados quando não há amostra elegível: zero por vacuidade não é OTIF 0%.
    otifPct: eligible.length > 0 ? round((otifCount / eligible.length) * 100, 2) : null,
    excluded: {
      noPromise: evaluated.filter((evaluation) => evaluation.situation === "no_promise").length,
      cancelledBeforePromise: evaluated.filter(
        (evaluation) => evaluation.situation === "cancelled_before_promise"
      ).length,
      inProgress: evaluated.filter((evaluation) => evaluation.situation === "in_progress").length,
    },
    observedLeadTimeDays: average(
      eligible
        .map((evaluation) => evaluation.actualLeadTimeDays)
        .filter((value): value is number => value !== null)
    ),
    promisedLeadTimeDays: average(
      eligible
        .map((evaluation) => evaluation.promisedLeadTimeDays)
        .filter((value): value is number => value !== null)
    ),
    averageDelayDays: average(
      eligible
        .map((evaluation) => evaluation.delayDays)
        .filter((value): value is number => value !== null)
    ),
    revisedPromiseCount: evaluated.filter((evaluation) => evaluation.revisions.length > 0).length,
    deliveries,
  };
}

/** Monta o DTO completo do painel (o serviço adiciona fornecedor e capabilities). */
export function buildSupplierPerformance(input: {
  supplier: SupplierPerformanceDto["supplier"];
  deliveries: OtifDeliverySnapshot[];
  period: OtifPeriod;
  now?: Date;
  timeZone?: string;
}): Omit<SupplierPerformanceDto, "capabilities"> {
  const timeZone = input.timeZone ?? OPERATIONAL_TIME_ZONE;
  const summary = computeOtifSummary({
    deliveries: input.deliveries,
    period: input.period,
    now: input.now,
    timeZone,
  });

  return {
    supplier: input.supplier,
    period: {
      from: dayKey(input.period.from, timeZone),
      to: dayKey(input.period.to, timeZone),
      basis: "promised_at_original",
      timeZone,
    },
    ...summary,
  };
}
