"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/shared/form-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import type { PurchaseItemDto } from "@/lib/purchases/types";
import {
  apiErrorFromBody,
  formatQuantityWithUnit,
  newIdempotencyKey,
  parseDecimalInput,
  parseJsonSafe,
  unitLabel,
} from "./purchase-detail-utils";

/**
 * Recebimento contra pedido emitido (US-06). Regras espelhadas do servidor:
 * só item com saldo aberto, quantidade nunca acima do saldo (sem tolerância nesta
 * versão), lote e custo documentado obrigatórios. A gravação de lote/movimento é
 * atômica no backend — a tela só reflete o resultado.
 */

export interface PurchaseWarehouseOption {
  id: string;
  name: string;
}

export interface PurchaseReceiptDrawerProps {
  isOpen: boolean;
  orderId: string;
  orderNumberLabel: string;
  items: PurchaseItemDto[];
  warehouses: PurchaseWarehouseOption[];
  onClose: () => void;
  /** Chamado após 201: o pai atualiza o pedido (router.refresh). */
  onReceived: () => void;
}

interface ReceiptErrors {
  item?: string;
  warehouse?: string;
  quantity?: string;
  lotNumber?: string;
  unitCost?: string;
  form?: string;
}

const QUANTITY_EPSILON = 0.00005;

function todayDateInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function PurchaseReceiptDrawer({
  isOpen,
  orderId,
  orderNumberLabel,
  items,
  warehouses,
  onClose,
  onReceived,
}: PurchaseReceiptDrawerProps) {
  const openItems = React.useMemo(
    () => items.filter((item) => item.quantityOpen > QUANTITY_EPSILON),
    [items]
  );

  const [itemId, setItemId] = React.useState(() => openItems[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = React.useState(() => warehouses[0]?.id ?? "");
  const [quantityText, setQuantityText] = React.useState("");
  const [lotNumber, setLotNumber] = React.useState("");
  const [heatNumber, setHeatNumber] = React.useState("");
  const [unitCost, setUnitCost] = React.useState<number | null>(
    () => openItems[0]?.unitPrice ?? null
  );
  const [locationAddress, setLocationAddress] = React.useState("");
  const [supplierDocumentReference, setSupplierDocumentReference] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(todayDateInput());
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<ReceiptErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Cada abertura reinicia o formulário com o primeiro item aberto e o custo do pedido.
  React.useEffect(() => {
    if (!isOpen) return;
    const firstItem = openItems[0] ?? null;
    setItemId(firstItem?.id ?? "");
    setWarehouseId(warehouses[0]?.id ?? "");
    setQuantityText("");
    setLotNumber("");
    setHeatNumber("");
    setUnitCost(firstItem?.unitPrice ?? null);
    setLocationAddress("");
    setSupplierDocumentReference("");
    setReceivedAt(todayDateInput());
    setNotes("");
    setErrors({});
    setSubmitting(false);
    // openItems/warehouses mudam a cada refresh do servidor; reiniciar apenas na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedItem = openItems.find((item) => item.id === itemId) ?? openItems[0] ?? null;

  function handleItemChange(nextId: string) {
    setItemId(nextId);
    const next = openItems.find((item) => item.id === nextId);
    setUnitCost(next?.unitPrice ?? null);
    setQuantityText("");
    setErrors((current) => ({ ...current, item: undefined, quantity: undefined }));
  }

  function validate(): ReceiptErrors {
    const next: ReceiptErrors = {};

    if (!selectedItem) {
      next.item = "Nenhum item com saldo aberto para receber.";
    }
    if (!warehouseId) {
      next.warehouse = "Selecione o depósito de entrada.";
    }

    const quantity = parseDecimalInput(quantityText);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      next.quantity = "Informe uma quantidade maior que zero.";
    } else if (selectedItem && quantity - selectedItem.quantityOpen > QUANTITY_EPSILON) {
      next.quantity = `Quantidade acima do saldo aberto (${formatQuantityWithUnit(
        selectedItem.quantityOpen,
        selectedItem.unit
      )}).`;
    }

    if (!lotNumber.trim()) {
      next.lotNumber = "Informe o lote/corrida do material.";
    }

    if (unitCost == null || !Number.isFinite(unitCost) || unitCost <= 0) {
      next.unitCost = "Informe o custo unitário documentado.";
    }

    return next;
  }

  async function handleSubmit() {
    if (submitting) return;

    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (!selectedItem || unitCost == null) return;

    const quantity = parseDecimalInput(quantityText);
    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch(`/api/purchases/${orderId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItem.id,
          warehouseId,
          quantity,
          lotNumber: lotNumber.trim(),
          heatNumber: heatNumber.trim() || null,
          unitCost,
          locationAddress: locationAddress.trim() || null,
          receivedAt: receivedAt ? new Date(`${receivedAt}T12:00:00`).toISOString() : null,
          supplierDocumentReference: supplierDocumentReference.trim() || null,
          notes: notes.trim() || null,
          idempotencyKey: newIdempotencyKey(),
        }),
      });

      const body = await parseJsonSafe(response);
      if (!response.ok) {
        throw new Error(
          apiErrorFromBody(body, response, "Não foi possível registrar o recebimento.")
        );
      }

      toast.success(
        `Recebimento de ${formatQuantityWithUnit(quantity, selectedItem.unit)} do lote ${lotNumber.trim()} registrado.`
      );
      onReceived();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível registrar o recebimento.";
      setErrors((current) => ({ ...current, form: message }));
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Receber item · ${orderNumberLabel}`}
      subtitle="Entrada por compra: cria lote e movimento com referência ao pedido"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={submitting || openItems.length === 0}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Registrando..." : "Confirmar recebimento"}
          </Button>
        </>
      }
    >
      {openItems.length === 0 ? (
        <EmptyState
          title="Nenhum item com saldo aberto"
          description="Todos os itens deste pedido já foram recebidos por completo ou estornados. Não há nada a receber."
          icon={<PackagePlus className="h-8 w-8" aria-hidden="true" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {errors.form && (
            <div
              role="alert"
              className="rounded border border-signal-risk/40 bg-signal-risk/10 px-3 py-2 font-body-sm text-body-sm text-signal-risk"
            >
              {errors.form}
            </div>
          )}

          {/* ITEM */}
          <div>
            <FieldLabel>Item do pedido</FieldLabel>
            <SelectMenu
              value={selectedItem?.id ?? ""}
              onChange={handleItemChange}
              aria-label="Item do pedido"
              error={!!errors.item}
              options={openItems.map((item) => ({
                value: item.id,
                label: `${item.sku} · ${truncate(item.description, 48)} — saldo ${formatQuantityWithUnit(
                  item.quantityOpen,
                  item.unit
                )}`,
              }))}
            />
            {errors.item && <FieldError>{errors.item}</FieldError>}
          </div>

          {selectedItem && (
            <div className="rounded border border-carbon-800 bg-carbon-950/60 p-3">
              <p className="font-mono text-label-code text-titanium-muted">{selectedItem.sku}</p>
              <p className="mt-0.5 font-body-sm text-body-sm text-titanium-light">
                {selectedItem.description}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <SummaryField
                  label="Pedida"
                  value={formatQuantityWithUnit(selectedItem.quantityOrdered, selectedItem.unit)}
                />
                <SummaryField
                  label="Recebida"
                  value={formatQuantityWithUnit(selectedItem.quantityReceived, selectedItem.unit)}
                />
                <SummaryField
                  label="Saldo aberto"
                  value={formatQuantityWithUnit(selectedItem.quantityOpen, selectedItem.unit)}
                  highlight
                />
              </dl>
            </div>
          )}

          {/* DEPÓSITO E QUANTIDADE */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Depósito de entrada</FieldLabel>
              {warehouses.length === 0 ? (
                <div className="rounded border border-signal-hold/40 bg-signal-hold/10 px-3 py-2 font-body-sm text-body-sm text-titanium-light">
                  Nenhum depósito ativo cadastrado.{" "}
                  <Link
                    href="/depositos"
                    className="text-signal-hold underline underline-offset-2 transition-colors hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                  >
                    Cadastrar depósito
                  </Link>
                </div>
              ) : (
                <>
                  <SelectMenu
                    value={warehouseId}
                    onChange={setWarehouseId}
                    aria-label="Depósito de entrada"
                    error={!!errors.warehouse}
                    options={warehouses.map((warehouse) => ({
                      value: warehouse.id,
                      label: warehouse.name,
                    }))}
                  />
                  {errors.warehouse && <FieldError>{errors.warehouse}</FieldError>}
                </>
              )}
            </div>

            <div>
              <FieldLabel htmlFor="receipt-quantity">
                Quantidade recebida ({unitLabel(selectedItem?.unit)})
              </FieldLabel>
              <Input
                id="receipt-quantity"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={quantityText}
                onChange={(event) => {
                  setQuantityText(event.target.value);
                  setErrors((current) => ({ ...current, quantity: undefined }));
                }}
                placeholder="0"
                error={!!errors.quantity}
                className="text-right font-mono"
              />
              <p className="mt-1 font-mono text-label-code text-titanium-muted">
                Saldo aberto:{" "}
                {selectedItem
                  ? formatQuantityWithUnit(selectedItem.quantityOpen, selectedItem.unit)
                  : "—"}
              </p>
              {errors.quantity && <FieldError>{errors.quantity}</FieldError>}
            </div>
          </div>

          {/* LOTE E CORRIDA */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="receipt-lot">Lote / corrida *</FieldLabel>
              <Input
                id="receipt-lot"
                value={lotNumber}
                onChange={(event) => {
                  setLotNumber(event.target.value);
                  setErrors((current) => ({ ...current, lotNumber: undefined }));
                }}
                maxLength={50}
                placeholder="Ex.: LT-GD-9941"
                error={!!errors.lotNumber}
                className="font-mono"
              />
              {errors.lotNumber && <FieldError>{errors.lotNumber}</FieldError>}
            </div>

            <div>
              <FieldLabel htmlFor="receipt-heat">Número de corrida (heat)</FieldLabel>
              <Input
                id="receipt-heat"
                value={heatNumber}
                onChange={(event) => setHeatNumber(event.target.value)}
                maxLength={50}
                placeholder="Ex.: C-99412B"
                className="font-mono"
              />
            </div>
          </div>

          {/* CUSTO E DATA */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="receipt-unit-cost">Custo unitário (R$)</FieldLabel>
              <CurrencyInput
                id="receipt-unit-cost"
                value={unitCost}
                onValueChange={(value) => {
                  setUnitCost(value);
                  setErrors((current) => ({ ...current, unitCost: undefined }));
                }}
                placeholder="0,00"
                aria-label="Custo unitário em reais"
              />
              <p className="mt-1 font-mono text-label-code text-titanium-muted">
                Custo do pedido: {selectedItem ? formatCurrencyBRL(selectedItem.unitPrice) : "—"}
              </p>
              {errors.unitCost && <FieldError>{errors.unitCost}</FieldError>}
            </div>

            <div>
              <FieldLabel htmlFor="receipt-date">Data do recebimento</FieldLabel>
              <Input
                id="receipt-date"
                type="date"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {/* LOCAL E DOCUMENTO */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="receipt-location">Localização física</FieldLabel>
              <Input
                id="receipt-location"
                value={locationAddress}
                onChange={(event) => setLocationAddress(event.target.value)}
                maxLength={50}
                placeholder="Galpão Central — Box B-01"
              />
            </div>

            <div>
              <FieldLabel htmlFor="receipt-document">Documento do fornecedor</FieldLabel>
              <Input
                id="receipt-document"
                value={supplierDocumentReference}
                onChange={(event) => setSupplierDocumentReference(event.target.value)}
                maxLength={100}
                placeholder="NF-e 441029"
                className="font-mono"
              />
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          <div>
            <FieldLabel htmlFor="receipt-notes">Observações do recebimento</FieldLabel>
            <textarea
              id="receipt-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Divergências, avarias, conferência de certificado..."
              className="w-full rounded border border-carbon-700 bg-carbon-950 px-3 py-2 font-body-md text-body-md text-ice-white transition-colors placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            />
          </div>

          <p className="rounded border border-carbon-800 bg-carbon-950/60 px-3 py-2 font-body-sm text-body-sm text-titanium-muted">
            O recebimento gera lote e movimento de entrada{" "}
            <span className="font-mono text-titanium-light">ENTRADA_COMPRA</span> com referência a{" "}
            {orderNumberLabel}. A quantidade não pode exceder o saldo aberto e o estorno preserva o
            histórico original.
          </p>
        </div>
      )}
    </FormDrawer>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  const className = "mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted";
  if (!htmlFor) return <span className={className}>{children}</span>;
  return (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 font-body-sm text-body-sm text-signal-risk">
      {children}
    </p>
  );
}

function SummaryField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-label-code uppercase text-titanium-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono text-label-code",
          highlight ? "font-bold text-signal-buy" : "text-titanium-light"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
