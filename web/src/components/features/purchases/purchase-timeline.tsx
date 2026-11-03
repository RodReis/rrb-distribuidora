"use client";

import * as React from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileCheck2,
  MessageSquare,
  PackagePlus,
  PencilLine,
  PlusCircle,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn, formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import { PURCHASE_STATUS_LABEL } from "@/lib/purchases/state-machine";
import type {
  ProductUnit,
  PurchaseEventDto,
  PurchaseItemDto,
  PurchaseStatus,
} from "@/lib/purchases/types";
import {
  FOLLOW_UP_TYPE_LABELS,
  formatDateBR,
  formatDateTimeBR,
  formatQuantity,
  formatQuantityWithUnit,
  shortHash,
} from "./purchase-detail-utils";

/**
 * Timeline auditável do pedido (US-05/§5): eventos em ordem cronológica, autor e
 * payload legível. Hash completo do conteúdo nunca é exibido — só o prefixo.
 */

type EventTone = "buy" | "hold" | "risk" | "accent" | "neutral";

interface EventMeta {
  label: string;
  icon: LucideIcon;
  tone: EventTone;
}

const TONE_CLASS: Record<EventTone, string> = {
  buy: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
  hold: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
  risk: "border-signal-risk/40 bg-signal-risk/10 text-signal-risk",
  accent: "border-tertiary/40 bg-tertiary/10 text-tertiary",
  neutral: "border-carbon-700 bg-carbon-800 text-titanium-muted",
};

const EVENT_META: Record<string, EventMeta> = {
  created: { label: "Pedido criado", icon: PlusCircle, tone: "neutral" },
  updated: { label: "Conteúdo editado", icon: PencilLine, tone: "hold" },
  submitted: { label: "Submetido para aprovação", icon: Send, tone: "hold" },
  approved: { label: "Pedido aprovado", icon: CheckCircle2, tone: "buy" },
  rejected: { label: "Pedido rejeitado", icon: XCircle, tone: "risk" },
  issued: { label: "Pedido emitido", icon: FileCheck2, tone: "buy" },
  follow_up: { label: "Follow-up registrado", icon: MessageSquare, tone: "accent" },
  cancelled: { label: "Pedido cancelado", icon: Ban, tone: "risk" },
  deleted: { label: "Rascunho excluído", icon: Trash2, tone: "neutral" },
  received: { label: "Recebimento registrado", icon: PackagePlus, tone: "buy" },
  receipt_reversed: { label: "Recebimento estornado", icon: Undo2, tone: "hold" },
  denied: { label: "Operação negada", icon: ShieldAlert, tone: "risk" },
};

const SKIPPED_KEYS = new Set([
  "receiptId",
  "movementId",
  "warehouseId",
  "itemId",
  "lotId",
  "contentHash",
]);

const KEY_LABELS: Record<string, string> = {
  itemQuantityOrdered: "Quantidade pedida",
  itemQuantityReceived: "Quantidade recebida",
  itemQuantityOpen: "Saldo aberto",
  purchaseOrderStatus: "Estado do pedido",
};

function payload(payloadValue: Record<string, unknown> | null): Record<string, unknown> {
  return payloadValue ?? {};
}

function payloadString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function payloadNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function describeItem(items: PurchaseItemDto[], itemId: string | null): string | null {
  if (!itemId) return null;
  const item = items.find((candidate) => candidate.id === itemId);
  return item ? `Item ${item.sku} · ${item.description}` : null;
}

function statusFromPayload(value: unknown): string | null {
  const status = payloadString(value);
  if (!status) return null;
  return PURCHASE_STATUS_LABEL[status as PurchaseStatus] ?? status;
}

/** Linhas legíveis do payload por tipo de evento (sem JSON cru, sem hash completo). */
function describeEvent(event: PurchaseEventDto, items: PurchaseItemDto[]): string[] {
  const data = payload(event.payload);
  const lines: (string | null)[] = [];
  const itemLine = describeItem(items, event.itemId);
  if (itemLine) lines.push(itemLine);

  switch (event.eventType) {
    case "created": {
      const count = payloadNumber(data.items);
      if (count != null) lines.push(`${count} item(ns) no pedido`);
      const total = payloadNumber(data.grandTotal);
      if (total != null) lines.push(`Total do pedido: ${formatCurrencyBRL(total)}`);
      break;
    }
    case "updated": {
      const total = payloadNumber(data.grandTotal);
      if (total != null) lines.push(`Novo total: ${formatCurrencyBRL(total)}`);
      const previous = statusFromPayload(data.previousStatus);
      if (previous) lines.push(`Estado anterior: ${previous}`);
      if (data.invalidatedApproval === true) {
        lines.push("Aprovação anterior invalidada pela edição");
      }
      break;
    }
    case "submitted": {
      const version = payloadNumber(data.version);
      if (version != null) lines.push(`Versão congelada: v${version}`);
      const hash = payloadString(data.contentHash);
      if (hash) lines.push(`Hash do conteúdo: ${shortHash(hash)}`);
      const matrix = payloadNumber(data.matrixVersion);
      if (matrix != null) lines.push(`Matriz de alçadas: v${matrix}`);
      if (data.alcadaConfigured === false) {
        lines.push("Sem faixa de alçada aplicável — emissão bloqueada");
      }
      break;
    }
    case "approved":
    case "rejected": {
      const version = payloadNumber(data.version);
      if (version != null) lines.push(`Versão decidida: v${version}`);
      const registered = payloadNumber(data.approvalsCount);
      const required = payloadNumber(data.requiredApprovals);
      if (registered != null && required != null) {
        lines.push(`Aprovações válidas: ${registered}/${required}`);
      }
      const matrix = payloadNumber(data.matrixVersion);
      if (matrix != null) lines.push(`Matriz de alçadas: v${matrix}`);
      const justification = payloadString(data.justification);
      if (justification) lines.push(`Justificativa: ${justification}`);
      break;
    }
    case "issued": {
      const number = payloadNumber(data.number);
      if (number != null) lines.push(`Número interno: #PC-${String(number).padStart(4, "0")}`);
      const version = payloadNumber(data.version);
      if (version != null) lines.push(`Versão emitida: v${version}`);
      const hash = payloadString(data.contentHash);
      if (hash) lines.push(`Hash do conteúdo: ${shortHash(hash)}`);
      break;
    }
    case "follow_up": {
      const type = payloadString(data.type);
      if (type) lines.push(`Tipo: ${FOLLOW_UP_TYPE_LABELS[type] ?? type}`);
      const note = payloadString(data.note);
      if (note) lines.push(`Nota: ${note}`);
      const expected = payloadString(data.expectedDeliveryAt);
      if (expected) lines.push(`Nova previsão: ${formatDateBR(expected)}`);
      break;
    }
    case "cancelled": {
      const reason = payloadString(data.reason);
      if (reason) lines.push(`Motivo: ${reason}`);
      const previous = statusFromPayload(data.previousStatus);
      if (previous) lines.push(`Estado anterior: ${previous}`);
      break;
    }
    case "deleted": {
      lines.push("Exclusão lógica do rascunho — histórico preservado em auditoria");
      break;
    }
    case "received": {
      const lot = payloadString(data.lotNumber);
      const heat = payloadString(data.heatNumber);
      if (lot) lines.push(`Lote ${lot}${heat ? ` · corrida ${heat}` : ""}`);
      const quantity = payloadNumber(data.quantity);
      if (quantity != null) {
        lines.push(
          `Quantidade: ${formatQuantityWithUnit(quantity, data.unit as ProductUnit | undefined)}`
        );
      }
      const unitCost = payloadNumber(data.unitCost);
      if (unitCost != null) lines.push(`Custo unitário: ${formatCurrencyBRL(unitCost)}`);
      const totalCost = payloadNumber(data.totalCost);
      if (totalCost != null) lines.push(`Custo total: ${formatCurrencyBRL(totalCost)}`);
      const document = payloadString(data.supplierDocumentReference);
      if (document) lines.push(`Documento do fornecedor: ${document}`);
      const receivedAt = payloadString(data.receivedAt);
      if (receivedAt) lines.push(`Recebido em: ${formatDateTimeBR(receivedAt)}`);
      const status = statusFromPayload(data.status);
      if (status) lines.push(`Estado do pedido: ${status}`);
      break;
    }
    case "receipt_reversed": {
      const lot = payloadString(data.lotNumber);
      if (lot) lines.push(`Lote estornado: ${lot}`);
      const itemUnit =
        (data.unit as ProductUnit | undefined) ??
        items.find((candidate) => candidate.id === event.itemId)?.unit;
      const quantity = payloadNumber(data.quantity);
      if (quantity != null) {
        lines.push(`Quantidade estornada: ${formatQuantityWithUnit(quantity, itemUnit)}`);
      }
      const unitCost = payloadNumber(data.unitCost);
      if (unitCost != null) lines.push(`Custo unitário: ${formatCurrencyBRL(unitCost)}`);
      const totalCost = payloadNumber(data.totalCost);
      if (totalCost != null) lines.push(`Custo total estornado: ${formatCurrencyBRL(totalCost)}`);
      const lotBalance = payloadNumber(data.lotQuantityCurrent);
      if (lotBalance != null) {
        lines.push(`Saldo do lote após estorno: ${formatQuantityWithUnit(lotBalance, itemUnit)}`);
      }
      const reason = payloadString(data.reason);
      if (reason) lines.push(`Motivo: ${reason}`);
      const status = statusFromPayload(data.status);
      if (status) lines.push(`Estado do pedido: ${status}`);
      break;
    }
    case "denied": {
      const capability = payloadString(data.capability);
      if (capability) lines.push(`Permissão avaliada: ${capability}`);
      const reason = payloadString(data.reason) ?? payloadString(data.message);
      if (reason) lines.push(`Motivo: ${reason}`);
      break;
    }
    default: {
      // Tipo novo (ex.: evolução do módulo): mostra os campos primitivos de forma genérica.
      for (const [key, value] of Object.entries(data)) {
        if (SKIPPED_KEYS.has(key)) continue;
        const label = KEY_LABELS[key] ?? null;
        const formatted = formatGenericPayloadValue(key, value);
        if (!formatted) continue;
        lines.push(label ? `${label}: ${formatted}` : formatted);
      }
      break;
    }
  }

  return lines.filter((line): line is string => !!line && line.length > 0);
}

function formatGenericPayloadValue(key: string, value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return `${value.length} item(ns)`;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") {
    if (/total|cost|amount/i.test(key)) return formatCurrencyBRL(value);
    if (/quantity/i.test(key)) return formatQuantity(value);
    return formatNumberBR(value, 0);
  }
  if (typeof value === "string") {
    if (/^[0-9a-f]{32,}$/i.test(value)) return shortHash(value);
    if (/(At|Date)$/.test(key)) return formatDateTimeBR(value);
    if (key === "status" || key === "previousStatus") return statusFromPayload(value) ?? value;
    return value;
  }
  return null;
}

export interface PurchaseTimelineProps {
  events: PurchaseEventDto[];
  items: PurchaseItemDto[];
}

export function PurchaseTimeline({ events, items }: PurchaseTimelineProps) {
  const ordered = React.useMemo(
    () =>
      [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [events]
  );

  if (ordered.length === 0) {
    return (
      <EmptyState
        title="Nenhum evento registrado"
        description="A trilha mostra criação, submissão, decisões, emissão, follow-ups e recebimentos deste pedido."
        icon={<Clock className="h-8 w-8" aria-hidden="true" />}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-label-caps text-label-caps uppercase text-titanium-muted">
          {ordered.length} evento(s) · ordem cronológica
        </p>
        <p className="font-mono text-label-code text-titanium-muted">
          Hash exibido em forma curta para conferência
        </p>
      </div>

      <ol className="flex flex-col">
        {ordered.map((event, index) => {
          const meta = EVENT_META[event.eventType] ?? {
            label: humanizeEventType(event.eventType),
            icon: Clock,
            tone: "neutral" as EventTone,
          };
          const Icon = meta.icon;
          const details = describeEvent(event, items);
          const isLast = index === ordered.length - 1;

          return (
            <li key={event.id} className="relative flex gap-3">
              <div className="flex w-8 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border",
                    TONE_CLASS[meta.tone]
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {!isLast && <span className="mt-1 w-px flex-1 bg-carbon-800" aria-hidden="true" />}
              </div>

              <div className="min-w-0 flex-1 pb-4">
                <div className="rounded border border-carbon-800 bg-carbon-950/60 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-body-md text-body-md font-medium text-ice-white">
                      {meta.label}
                    </p>
                    <time
                      dateTime={event.createdAt}
                      className="font-mono text-label-code text-titanium-muted"
                    >
                      {formatDateTimeBR(event.createdAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 font-mono text-label-code text-titanium-muted">
                    por {event.actorName ?? "Sistema"}
                  </p>
                  {details.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {details.map((line, lineIndex) => (
                        <li
                          key={lineIndex}
                          className="font-body-sm text-body-sm text-titanium-light"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function humanizeEventType(type: string): string {
  const cleaned = type.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Evento";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
