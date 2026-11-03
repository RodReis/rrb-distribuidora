"use client";

import * as React from "react";
import { AlertTriangle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Diálogos de ação destrutiva que EXIGEM justificativa (cancelamento, rejeição e
 * estorno de recebimento). O `ConfirmDialog` compartilhado não aceita campo de
 * entrada, por isso esta variante mantém o mesmo estilo de modal do design
 * system e adiciona o motivo obrigatório — nunca `window.confirm`.
 */

const MIN_REASON_LENGTH = 5;

export interface PurchaseReasonDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  loading?: boolean;
  minLength?: number;
  icon?: React.ReactNode;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function PurchaseReasonDialog({
  isOpen,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  loading = false,
  minLength = MIN_REASON_LENGTH,
  icon,
  onCancel,
  onConfirm,
}: PurchaseReasonDialogProps) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const fieldId = React.useId();
  const errorId = React.useId();

  // Cada abertura começa com o campo limpo, sem herdar texto de uma ação anterior.
  React.useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  function confirm() {
    const trimmed = reason.trim();
    if (trimmed.length < minLength) {
      setError(`Informe uma justificativa com pelo menos ${minLength} caracteres.`);
      return;
    }
    setError(null);
    onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 animate-in fade-in bg-black/80 backdrop-blur-xs"
        onClick={loading ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        className="relative z-10 w-full max-w-lg animate-in zoom-in-95 rounded border border-carbon-700 bg-carbon-900 p-5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)] duration-150"
      >
        <div className="flex items-start gap-3">
          <div className="rounded border border-signal-risk/30 bg-signal-risk/10 p-2 text-signal-risk">
            {icon ?? <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div className="flex-1">
            <h3
              id={`${fieldId}-title`}
              className="font-headline-sm text-headline-sm text-ice-white"
            >
              {title}
            </h3>
            <p className="mt-1.5 font-body-md text-body-md text-titanium-muted">{description}</p>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor={fieldId}
            className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted"
          >
            {label} <span className="text-carmine-signal">*</span>
          </label>
          <textarea
            id={fieldId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            rows={3}
            maxLength={1000}
            placeholder={placeholder}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="w-full rounded border border-carbon-700 bg-carbon-950 px-3 py-2 font-body-md text-body-md text-ice-white transition-colors placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:cursor-not-allowed disabled:opacity-50"
            autoFocus
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span
              id={errorId}
              role={error ? "alert" : undefined}
              className="font-body-sm text-body-sm text-signal-risk"
            >
              {error}
            </span>
            <span className="font-mono text-label-code text-titanium-muted">
              Mínimo {minLength} caracteres
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
            Voltar
          </Button>
          <Button variant="danger" size="md" onClick={confirm} disabled={loading}>
            {loading ? "Processando..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface PurchaseCancelDialogProps {
  isOpen: boolean;
  orderLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Cancelamento do PC: motivo obrigatório, histórico preservado. */
export function PurchaseCancelDialog({
  isOpen,
  orderLabel,
  loading,
  onCancel,
  onConfirm,
}: PurchaseCancelDialogProps) {
  return (
    <PurchaseReasonDialog
      isOpen={isOpen}
      title="Cancelar pedido de compra?"
      description={`O pedido ${orderLabel} será encerrado como cancelado. A emissão e os recebimentos anteriores permanecem no histórico e na auditoria.`}
      label="Motivo do cancelamento"
      placeholder="Ex.: fornecedor sem estoque para o prazo combinado"
      confirmLabel="Cancelar pedido"
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export interface PurchaseReverseDialogProps {
  isOpen: boolean;
  receiptLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Estorno de recebimento: gera movimento compensatório; o original não é apagado. */
export function PurchaseReverseDialog({
  isOpen,
  receiptLabel,
  loading,
  onCancel,
  onConfirm,
}: PurchaseReverseDialogProps) {
  return (
    <PurchaseReasonDialog
      isOpen={isOpen}
      title="Estornar recebimento?"
      description={`O recebimento ${receiptLabel} será estornado com movimento compensatório de estoque. O registro original continua no histórico do pedido.`}
      label="Justificativa do estorno"
      placeholder="Ex.: lote recebido com divergência de certificado"
      confirmLabel="Estornar recebimento"
      icon={<Undo2 className="h-5 w-5" aria-hidden="true" />}
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
