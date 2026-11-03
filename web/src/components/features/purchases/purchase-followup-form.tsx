"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import type { PurchaseOrderDetail } from "@/lib/purchases/types";
import {
  apiErrorFromBody,
  FOLLOW_UP_TYPE_LABELS,
  newIdempotencyKey,
  parseJsonSafe,
} from "./purchase-detail-utils";

/**
 * Follow-up manual do pedido emitido (US-05): confirmação, contato, ocorrência ou
 * nova previsão. Não envia nada ao fornecedor — apenas registra data/hora, autor,
 * tipo, nota e a previsão no histórico auditável.
 */

const FOLLOW_UP_TYPES = ["confirmacao", "contato", "ocorrencia", "previsao"] as const;
type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

const FOLLOW_UP_HINT: Record<FollowUpType, string> = {
  confirmacao: "O fornecedor confirmou o recebimento do pedido e/ou o prazo combinado.",
  contato: "Registro de ligação, e-mail ou WhatsApp, mesmo sem confirmação formal.",
  ocorrencia: "Atraso, divergência de documento, avaria ou outro problema de fornecimento.",
  previsao: "Nova data de entrega prometida pelo fornecedor. Atualiza a previsão do pedido.",
};

export interface PurchaseFollowUpFormProps {
  isOpen: boolean;
  orderId: string;
  orderNumberLabel: string;
  currentExpectedDeliveryAt: string | null;
  onClose: () => void;
  onSaved: (order: PurchaseOrderDetail) => void;
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function PurchaseFollowUpForm({
  isOpen,
  orderId,
  orderNumberLabel,
  currentExpectedDeliveryAt,
  onClose,
  onSaved,
}: PurchaseFollowUpFormProps) {
  const [type, setType] = React.useState<FollowUpType>("confirmacao");
  const [note, setNote] = React.useState("");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = React.useState(() =>
    toDateInput(currentExpectedDeliveryAt)
  );
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setType("confirmacao");
    setNote("");
    setExpectedDeliveryAt(toDateInput(currentExpectedDeliveryAt));
    setNoteError(null);
    setFormError(null);
    setSubmitting(false);
  }, [isOpen, currentExpectedDeliveryAt]);

  async function handleSubmit() {
    if (submitting) return;

    const trimmedNote = note.trim();
    if (trimmedNote.length < 3) {
      setNoteError("Descreva o contato ou a ocorrência (mínimo 3 caracteres).");
      return;
    }
    setNoteError(null);
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/purchases/${orderId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          note: trimmedNote,
          expectedDeliveryAt: expectedDeliveryAt
            ? new Date(`${expectedDeliveryAt}T12:00:00`).toISOString()
            : null,
          idempotencyKey: newIdempotencyKey(),
        }),
      });

      const body = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(
          apiErrorFromBody(body, response, "Não foi possível registrar o follow-up.")
        );
      }

      const order = body?.order as PurchaseOrderDetail | undefined;
      if (!order) throw new Error("Resposta inesperada do servidor.");

      toast.success("Follow-up registrado na timeline do pedido.");
      onSaved(order);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar o follow-up.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Registrar follow-up · ${orderNumberLabel}`}
      subtitle="Acompanhamento manual do fornecedor — não altera estoque nem envia mensagem"
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Registrando..." : "Registrar follow-up"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && (
          <div
            role="alert"
            className="rounded border border-signal-risk/40 bg-signal-risk/10 px-3 py-2 font-body-sm text-body-sm text-signal-risk"
          >
            {formError}
          </div>
        )}

        <div>
          <span className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted">
            Tipo de acompanhamento
          </span>
          <SelectMenu
            value={type}
            onChange={(next) => setType(next as FollowUpType)}
            aria-label="Tipo de follow-up"
            options={FOLLOW_UP_TYPES.map((value) => ({
              value,
              label: FOLLOW_UP_TYPE_LABELS[value],
            }))}
          />
          <p className="mt-1 font-body-sm text-body-sm text-titanium-muted">
            {FOLLOW_UP_HINT[type]}
          </p>
        </div>

        <div>
          <label
            htmlFor="followup-note"
            className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted"
          >
            Nota do follow-up *
          </label>
          <textarea
            id="followup-note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (noteError) setNoteError(null);
            }}
            placeholder="Ex.: fornecedor confirmou entrega parcial para 12/11 e o restante até 18/11."
            aria-invalid={!!noteError}
            aria-describedby={noteError ? "followup-note-error" : undefined}
            className="w-full rounded border border-carbon-700 bg-carbon-950 px-3 py-2 font-body-md text-body-md text-ice-white transition-colors placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            autoFocus
          />
          {noteError && (
            <p
              id="followup-note-error"
              role="alert"
              className="mt-1 font-body-sm text-body-sm text-signal-risk"
            >
              {noteError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="followup-expected"
            className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted"
          >
            Nova previsão de entrega
          </label>
          <Input
            id="followup-expected"
            type="date"
            value={expectedDeliveryAt}
            onChange={(event) => setExpectedDeliveryAt(event.target.value)}
            className="font-mono"
          />
          <p className="mt-1 font-body-sm text-body-sm text-titanium-muted">
            Quando informada, substitui a previsão atual do pedido. Deixe vazio para manter a data
            vigente.
          </p>
        </div>

        <p className="rounded border border-carbon-800 bg-carbon-950/60 px-3 py-2 font-body-sm text-body-sm text-titanium-muted">
          O registro entra na timeline com seu usuário e data/hora. Nenhum e-mail ou mensagem é
          enviado automaticamente ao fornecedor nesta versão.
        </p>
      </div>
    </FormDrawer>
  );
}
