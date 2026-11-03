"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Info,
  PackagePlus,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrencyBRL } from "@/lib/utils";
import { PURCHASE_STATUS_LABEL, PURCHASE_STATUS_TONE } from "@/lib/purchases/state-machine";
import type { PurchaseStatus } from "@/lib/purchases/types";

// ---------------------------------------------------------------------------
// Tipos públicos consumidos pelas páginas server (/compras/nova e /editar)
// ---------------------------------------------------------------------------

export interface PurchaseFormSupplierOption {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  city: string | null;
  uf: string | null;
  paymentTerms: string | null;
}

export interface PurchaseFormProductOption {
  id: string;
  sku: string;
  description: string;
  unit: string;
}

export interface PurchaseFormWarehouseOption {
  id: string;
  name: string;
  type: string;
}

export interface PurchaseFormInitialItem {
  productId: string;
  description?: string;
  /** Texto editável em pt-BR (vírgula decimal). */
  quantity: string;
  unitPrice: number | null;
  discountAmount?: number | null;
  notes?: string | null;
  additionalCosts?: { description: string; amount: number }[];
}

export interface PurchaseFormInitial {
  supplierId: string;
  /** `YYYY-MM-DD` ou string vazia. */
  expectedDeliveryAt: string;
  items: PurchaseFormInitialItem[];
}

export interface PurchaseFormStockSuggestion {
  productId: string;
  quantity: number;
}

export interface PurchaseFormClientProps {
  mode: "create" | "edit";
  orderId?: string;
  orderLabel?: string;
  initialStatus?: PurchaseStatus;
  suppliers: PurchaseFormSupplierOption[];
  products: PurchaseFormProductOption[];
  warehouses: PurchaseFormWarehouseOption[];
  initial: PurchaseFormInitial;
  /** Presente quando a tela foi aberta a partir da sugestão de compra do estoque (M2). */
  stockSuggestion?: PurchaseFormStockSuggestion | null;
}

// ---------------------------------------------------------------------------
// Estado interno do formulário
// ---------------------------------------------------------------------------

interface AdditionalCostState {
  key: string;
  description: string;
  amount: number | null;
}

interface ItemState {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: number | null;
  discountAmount: number | null;
  notes: string;
  additionalCosts: AdditionalCostState[];
}

interface ItemErrors {
  productId?: string;
  quantity?: string;
  unitPrice?: string;
  discountAmount?: string;
  additional: Record<string, string>;
}

interface FormErrors {
  supplierId?: string;
  expectedDeliveryAt?: string;
  items: ItemErrors[];
  general?: string;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `k-${Date.now().toString(36)}-${keySeq}`;
}

function emptyItem(overrides: Partial<ItemState> = {}): ItemState {
  return {
    key: nextKey(),
    productId: "",
    description: "",
    quantity: "",
    unitPrice: null,
    discountAmount: null,
    notes: "",
    additionalCosts: [],
    ...overrides,
  };
}

/** Converte texto pt-BR (`1.234,5`) em número. Aceita ponto decimal como fallback. */
function parseQuantity(text: string): number {
  const trimmed = text.trim().replace(/\s/g, "");
  if (!trimmed) return 0;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quantityToText(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(value).replace(".", ",");
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function lineTotalOf(item: ItemState): number {
  const quantity = parseQuantity(item.quantity);
  const unitPrice = item.unitPrice ?? 0;
  const discount = item.discountAmount ?? 0;
  const additional = item.additionalCosts.reduce((acc, cost) => acc + (cost.amount ?? 0), 0);
  return round2(quantity * unitPrice - discount + additional);
}

function initialState(initial: PurchaseFormInitial): ItemState[] {
  const items = initial.items.length
    ? initial.items.map((item) =>
        emptyItem({
          productId: item.productId,
          description: item.description ?? "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount ?? null,
          notes: item.notes ?? "",
          additionalCosts: (item.additionalCosts ?? []).map((cost) => ({
            key: nextKey(),
            description: cost.description,
            amount: cost.amount,
          })),
        })
      )
    : [emptyItem()];
  return items;
}

const FIELD_LABEL = "font-label-caps text-label-caps uppercase tracking-wider text-titanium-muted";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-body-sm text-carmine-signal">{message}</p>;
}

export function PurchaseFormClient({
  mode,
  orderId,
  orderLabel,
  initialStatus,
  suppliers,
  products,
  warehouses,
  initial,
  stockSuggestion,
}: PurchaseFormClientProps) {
  const router = useRouter();
  const [supplierId, setSupplierId] = React.useState(initial.supplierId);
  const [expectedDeliveryAt, setExpectedDeliveryAt] = React.useState(initial.expectedDeliveryAt);
  const [items, setItems] = React.useState<ItemState[]>(() => initialState(initial));
  const [errors, setErrors] = React.useState<FormErrors>({ items: [] });
  const [saving, setSaving] = React.useState(false);

  const productMap = React.useMemo(() => {
    const map = new Map<string, PurchaseFormProductOption>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const suggestionProduct = stockSuggestion ? productMap.get(stockSuggestion.productId) : null;

  const totals = React.useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let additionalTotal = 0;
    for (const item of items) {
      subtotal += round2(parseQuantity(item.quantity) * (item.unitPrice ?? 0));
      discountTotal += item.discountAmount ?? 0;
      additionalTotal += item.additionalCosts.reduce((acc, cost) => acc + (cost.amount ?? 0), 0);
    }
    subtotal = round2(subtotal);
    discountTotal = round2(discountTotal);
    additionalTotal = round2(additionalTotal);
    return {
      subtotal,
      discountTotal,
      additionalTotal,
      grandTotal: round2(subtotal - discountTotal + additionalTotal),
    };
  }, [items]);

  const isEditing = mode === "edit";

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function clearItemError(key: string, field: keyof Omit<ItemErrors, "additional">) {
    setErrors((current) => ({
      ...current,
      items: current.items.map((itemErrors, index) =>
        items[index]?.key === key ? { ...itemErrors, [field]: undefined } : itemErrors
      ),
    }));
  }

  function addItem() {
    setItems((current) => [...current, emptyItem()]);
  }

  function removeItem(key: string) {
    setItems((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.key !== key);
    });
    setErrors((current) => ({ ...current, items: [] }));
  }

  function addAdditionalCost(itemKey: string) {
    setItems((current) =>
      current.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              additionalCosts: [
                ...item.additionalCosts,
                { key: nextKey(), description: "", amount: null },
              ],
            }
          : item
      )
    );
  }

  function updateAdditionalCost(
    itemKey: string,
    costKey: string,
    patch: Partial<AdditionalCostState>
  ) {
    setItems((current) =>
      current.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              additionalCosts: item.additionalCosts.map((cost) =>
                cost.key === costKey ? { ...cost, ...patch } : cost
              ),
            }
          : item
      )
    );
  }

  function removeAdditionalCost(itemKey: string, costKey: string) {
    setItems((current) =>
      current.map((item) =>
        item.key === itemKey
          ? {
              ...item,
              additionalCosts: item.additionalCosts.filter((cost) => cost.key !== costKey),
            }
          : item
      )
    );
  }

  function clearAdditionalError(costKey: string) {
    setErrors((current) => ({
      ...current,
      items: current.items.map((itemErrors) => {
        if (!itemErrors) return itemErrors;
        const additional = { ...itemErrors.additional };
        delete additional[costKey];
        return { ...itemErrors, additional };
      }),
    }));
  }

  function validate(): { errors: FormErrors; invalidFields: number } {
    const nextErrors: FormErrors = { items: [] };
    let invalidFields = 0;

    if (!supplierId) {
      nextErrors.supplierId = "Selecione o fornecedor do pedido.";
      invalidFields += 1;
    }
    if (expectedDeliveryAt && Number.isNaN(new Date(`${expectedDeliveryAt}T12:00:00`).getTime())) {
      nextErrors.expectedDeliveryAt = "Informe uma data de previsão válida.";
      invalidFields += 1;
    }
    if (items.length === 0) {
      nextErrors.general = "Inclua ao menos um item no pedido.";
      invalidFields += 1;
    }

    for (const item of items) {
      const itemErrors: ItemErrors = { additional: {} };
      const product = productMap.get(item.productId);

      if (!item.productId) {
        itemErrors.productId = "Selecione o produto.";
        invalidFields += 1;
      } else if (!product) {
        itemErrors.productId = "Produto indisponível no catálogo ativo.";
        invalidFields += 1;
      }

      const quantity = parseQuantity(item.quantity);
      if (!(quantity > 0)) {
        itemErrors.quantity = "Quantidade deve ser maior que zero.";
        invalidFields += 1;
      }

      if (!item.unitPrice || item.unitPrice <= 0) {
        itemErrors.unitPrice = "Preço unitário deve ser maior que zero.";
        invalidFields += 1;
      }

      if (lineTotalOf(item) < 0) {
        itemErrors.discountAmount = "Desconto maior que o total da linha.";
        invalidFields += 1;
      }

      for (const cost of item.additionalCosts) {
        const hasDescription = cost.description.trim().length > 0;
        const hasAmount = (cost.amount ?? 0) > 0;
        if (!hasDescription && !hasAmount) continue;
        if (!hasDescription) {
          itemErrors.additional[cost.key] = "Descreva o custo adicional.";
          invalidFields += 1;
        } else if (!hasAmount) {
          itemErrors.additional[cost.key] = "Informe um valor maior que zero.";
          invalidFields += 1;
        }
      }

      nextErrors.items.push(itemErrors);
    }

    return { errors: nextErrors, invalidFields };
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const { errors: nextErrors, invalidFields } = validate();
    setErrors(nextErrors);

    if (invalidFields > 0) {
      toast.error(`Revise os ${invalidFields} campo(s) destacado(s).`);
      requestAnimationFrame(() => {
        const firstInvalid =
          document.querySelector<HTMLElement>("[aria-invalid='true']") ??
          document.querySelector<HTMLElement>(".border-signal-risk");
        firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
        firstInvalid?.focus();
      });
      return;
    }

    // Meio-dia local evita que o dia da previsão "ande" quando o consumidor exibe o ISO
    // em fuso local (ex.: meia-noite UTC apareceria como dia anterior em America/Sao_Paulo).
    const expectedDeliveryAtIso = expectedDeliveryAt
      ? new Date(`${expectedDeliveryAt}T12:00:00`).toISOString()
      : null;

    const payload = {
      supplierId,
      expectedDeliveryAt: expectedDeliveryAtIso,
      items: items.map((item) => ({
        productId: item.productId,
        description: item.description.trim() || undefined,
        quantity: parseQuantity(item.quantity),
        unitPrice: item.unitPrice ?? 0,
        discountAmount: item.discountAmount ?? 0,
        additionalCosts: item.additionalCosts
          .filter((cost) => cost.description.trim() && (cost.amount ?? 0) > 0)
          .map((cost) => ({ description: cost.description.trim(), amount: cost.amount ?? 0 })),
        notes: item.notes.trim() || undefined,
      })),
    };

    setSaving(true);
    try {
      const url = isEditing && orderId ? `/api/purchases/${orderId}` : "/api/purchases";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        order?: { order?: { id?: string; numberLabel?: string; statusLabel?: string } };
      } | null;

      if (!res.ok) {
        throw new Error(body?.error ?? "Não foi possível salvar o pedido de compra.");
      }

      const saved = body?.order?.order;
      if (!saved?.id) {
        throw new Error("O servidor não devolveu o pedido salvo. Recarregue a lista de compras.");
      }

      toast.success(
        isEditing
          ? `Pedido ${saved.numberLabel ?? ""} salvo como rascunho. Aprovação anterior invalidada.`
          : `Pedido ${saved.numberLabel ?? ""} criado como rascunho.`
      );
      router.push(`/compras/${saved.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado ao salvar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  const totalItems = items.length;
  const hasAnyItem = items.some((item) => item.productId);
  const suggestionQuantityText = stockSuggestion ? quantityToText(stockSuggestion.quantity) : "";

  return (
    <form
      id="purchase-form"
      onSubmit={onSubmit}
      className="mx-auto flex max-w-5xl flex-col gap-space-md"
      noValidate
    >
      <Breadcrumbs
        items={
          isEditing
            ? [
                { label: "Início", href: "/dashboard" },
                { label: "Compras", href: "/compras" },
                {
                  label: orderLabel ?? "Pedido",
                  href: orderId ? `/compras/${orderId}` : undefined,
                },
                { label: "Editar" },
              ]
            : [
                { label: "Início", href: "/dashboard" },
                { label: "Compras", href: "/compras" },
                { label: "Novo pedido" },
              ]
        }
      />

      <PageHeader
        title={isEditing ? "Edição de pedido de compra" : "Novo pedido de compra"}
        description={
          isEditing
            ? "Alterações voltam o pedido para rascunho e invalidam qualquer aprovação anterior."
            : "Rascunho de compra: nada é emitido, reservado ou enviado ao fornecedor nesta etapa."
        }
        badge={
          isEditing && initialStatus ? (
            <StatusBadge
              tone={PURCHASE_STATUS_TONE[initialStatus]}
              label={PURCHASE_STATUS_LABEL[initialStatus]}
            />
          ) : (
            <span className="rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-light">
              RASCUNHO
            </span>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href={isEditing && orderId ? `/compras/${orderId}` : "/compras"}>
              <Button type="button" variant="secondary" size="md">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Salvando…" : "Salvar rascunho"}
            </Button>
          </div>
        }
      />

      {isEditing && initialStatus && initialStatus !== "rascunho" && (
        <div className="flex items-start gap-space-sm rounded border border-carbon-700/70 border-l-4 border-l-signal-hold bg-carbon-900 p-space-sm px-space-md">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-hold" />
          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-label-caps font-bold uppercase text-signal-hold">
              Edição invalida a aprovação anterior
            </span>
            <span className="text-body-sm font-body-sm text-titanium-light">
              Este pedido está em “{PURCHASE_STATUS_LABEL[initialStatus]}”. Ao salvar, ele volta
              para rascunho, a aprovação registrada deixa de valer e será necessário submeter e
              aprovar a nova versão antes de emitir.
            </span>
          </div>
        </div>
      )}

      {stockSuggestion && (
        <div className="flex items-start gap-space-sm rounded border border-carbon-700/70 border-l-4 border-l-tertiary bg-carbon-900 p-space-sm px-space-md">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-label-caps font-bold uppercase text-tertiary">
              Quantidade estimada pela sugestão de compra do estoque
            </span>
            <span className="text-body-sm font-body-sm text-titanium-light">
              Produto{" "}
              <strong className="font-mono text-ice-white">
                {suggestionProduct?.sku ?? stockSuggestion.productId}
              </strong>{" "}
              com {formatQuantityLabel(suggestionQuantityText)} sugerida(s). Isto{" "}
              <strong className="text-ice-white">não é reserva de estoque</strong> nem quantidade
              confirmada: revise preço, fornecedor e quantidade antes de salvar.
            </span>
          </div>
        </div>
      )}

      {/* Dados do pedido */}
      <section className="rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
        <div className="mb-3 flex items-center gap-2 border-b border-carbon-800 pb-2">
          <PackagePlus className="h-4 w-4 text-tertiary" />
          <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
            Dados do pedido
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label id="supplier-label" className={FIELD_LABEL}>
              Fornecedor <span className="text-carmine-signal">*</span>
            </label>
            <SelectMenu
              value={supplierId}
              onChange={(value) => {
                setSupplierId(value);
                setErrors((current) => ({ ...current, supplierId: undefined }));
              }}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: `${supplier.tradeName || supplier.legalName} · CNPJ ${supplier.cnpj}`,
              }))}
              placeholder="Selecione o fornecedor ativo"
              error={Boolean(errors.supplierId)}
              aria-label="Fornecedor do pedido"
            />
            <FieldError message={errors.supplierId} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="expected-delivery" className={FIELD_LABEL}>
              Previsão de entrega
            </label>
            <Input
              id="expected-delivery"
              type="date"
              value={expectedDeliveryAt}
              onChange={(event) => {
                setExpectedDeliveryAt(event.target.value);
                setErrors((current) => ({ ...current, expectedDeliveryAt: undefined }));
              }}
              error={Boolean(errors.expectedDeliveryAt)}
            />
            <FieldError message={errors.expectedDeliveryAt} />
          </div>
        </div>

        <p className="mt-3 text-body-sm font-body-sm text-titanium-muted">
          {warehouses.length > 0
            ? `O depósito de entrada é definido no recebimento contra o pedido emitido. Depósitos ativos disponíveis: ${warehouses
                .map((warehouse) => warehouse.name)
                .join(", ")}.`
            : "Nenhum depósito ativo cadastrado: não será possível receber contra este pedido até cadastrar um depósito."}
        </p>
      </section>

      {/* Itens */}
      <section className="flex flex-col gap-space-md rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon-800 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
              Itens do pedido
            </h2>
            <span className="rounded border border-carbon-700 bg-carbon-950 px-2 py-0.5 font-mono text-label-code text-titanium-light">
              {totalItems} {totalItems === 1 ? "linha" : "linhas"}
            </span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar item
          </Button>
        </div>

        {errors.general && (
          <div className="rounded border border-signal-risk/40 bg-signal-risk/10 px-3 py-2 text-body-sm text-carmine-signal">
            {errors.general}
          </div>
        )}

        {!hasAnyItem && items.length === 1 && (
          <div className="rounded border border-dashed border-carbon-700 bg-carbon-950/50 px-3 py-2 text-body-sm text-titanium-muted">
            Nenhum item selecionado ainda. Escolha o produto, a quantidade e o preço unitário
            negociado.
          </div>
        )}

        <div className="flex flex-col gap-space-sm">
          {items.map((item, index) => {
            const product = productMap.get(item.productId);
            const unit = product?.unit ?? "kg";
            const itemErrors: ItemErrors = errors.items[index] ?? { additional: {} };
            const isSuggestionRow =
              stockSuggestion != null && item.productId === stockSuggestion.productId;

            return (
              <div
                key={item.key}
                className="rounded border border-carbon-800 bg-carbon-950/40 p-space-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-label-code text-titanium-muted">
                      ITEM {String(index + 1).padStart(2, "0")}
                    </span>
                    {isSuggestionRow && (
                      <span className="inline-flex items-center gap-1 rounded border border-tertiary/40 bg-tertiary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-tertiary">
                        <Sparkles className="h-2.5 w-2.5" />
                        Qtd. estimada (sugestão)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-label-code text-titanium-muted">
                      Linha:{" "}
                      <strong className="text-ice-white">
                        {formatCurrencyBRL(lineTotalOf(item))}
                      </strong>
                    </span>
                    <button
                      type="button"
                      title="Remover item"
                      aria-label={`Remover item ${index + 1}`}
                      disabled={items.length <= 1 || saving}
                      onClick={() => removeItem(item.key)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-carbon-700 bg-carbon-800 text-titanium-muted transition-colors hover:bg-carbon-700 hover:text-signal-risk focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-space-sm md:grid-cols-12">
                  <div className="flex flex-col gap-1.5 md:col-span-5">
                    <label className={FIELD_LABEL}>
                      Produto <span className="text-carmine-signal">*</span>
                    </label>
                    <SelectMenu
                      value={item.productId}
                      onChange={(value) => {
                        updateItem(item.key, { productId: value });
                        clearItemError(item.key, "productId");
                      }}
                      options={products.map((option) => ({
                        value: option.id,
                        label: `${option.sku} · ${option.description}`,
                      }))}
                      placeholder="Selecione o produto ativo"
                      error={Boolean(itemErrors.productId)}
                      aria-label={`Produto do item ${index + 1}`}
                    />
                    <FieldError message={itemErrors.productId} />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className={FIELD_LABEL}>
                      Qtd ({unit.toUpperCase()}) <span className="text-carmine-signal">*</span>
                    </label>
                    <Input
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) => {
                        updateItem(item.key, { quantity: event.target.value });
                        clearItemError(item.key, "quantity");
                      }}
                      placeholder="0"
                      className="text-right font-mono"
                      error={Boolean(itemErrors.quantity)}
                      aria-label={`Quantidade do item ${index + 1}`}
                      aria-invalid={Boolean(itemErrors.quantity)}
                    />
                    <FieldError message={itemErrors.quantity} />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className={FIELD_LABEL}>
                      Preço unit. (R$) <span className="text-carmine-signal">*</span>
                    </label>
                    <CurrencyInput
                      value={item.unitPrice}
                      onValueChange={(value) => {
                        updateItem(item.key, { unitPrice: value });
                        clearItemError(item.key, "unitPrice");
                      }}
                      error={Boolean(itemErrors.unitPrice)}
                      className="text-right"
                      aria-label={`Preço unitário do item ${index + 1}`}
                    />
                    <FieldError message={itemErrors.unitPrice} />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <label className={FIELD_LABEL}>Desconto (R$)</label>
                    <CurrencyInput
                      value={item.discountAmount}
                      onValueChange={(value) => {
                        updateItem(item.key, { discountAmount: value });
                        clearItemError(item.key, "discountAmount");
                      }}
                      error={Boolean(itemErrors.discountAmount)}
                      className="text-right"
                      aria-label={`Desconto do item ${index + 1}`}
                    />
                    <FieldError message={itemErrors.discountAmount} />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-10">
                    <label className={FIELD_LABEL}>Descrição no pedido (opcional)</label>
                    <Input
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.key, { description: event.target.value })
                      }
                      placeholder={
                        product
                          ? `Padrão do catálogo: ${product.description}`
                          : "Descrição comercial"
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className={FIELD_LABEL}>Observação</label>
                    <Input
                      value={item.notes}
                      onChange={(event) => updateItem(item.key, { notes: event.target.value })}
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                {/* Custos adicionais por linha */}
                <div className="mt-2 rounded border border-carbon-800 bg-carbon-900/60 p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-label-caps text-label-caps uppercase tracking-wider text-titanium-muted">
                      Custos adicionais da linha
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addAdditionalCost(item.key)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Custo
                    </Button>
                  </div>

                  {item.additionalCosts.length === 0 ? (
                    <p className="text-body-sm text-titanium-muted">
                      Frete, embalagem ou outros custos discriminados deste item.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {item.additionalCosts.map((cost) => (
                        <div
                          key={cost.key}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-start"
                        >
                          <div className="flex flex-1 flex-col gap-1">
                            <Input
                              value={cost.description}
                              onChange={(event) => {
                                updateAdditionalCost(item.key, cost.key, {
                                  description: event.target.value,
                                });
                                clearAdditionalError(cost.key);
                              }}
                              placeholder="Descrição do custo (frete, embalagem…)"
                              error={Boolean(itemErrors.additional[cost.key])}
                              aria-label="Descrição do custo adicional"
                            />
                          </div>
                          <div className="flex w-full flex-col gap-1 sm:w-40">
                            <CurrencyInput
                              value={cost.amount}
                              onValueChange={(value) => {
                                updateAdditionalCost(item.key, cost.key, { amount: value });
                                clearAdditionalError(cost.key);
                              }}
                              placeholder="0,00"
                              error={Boolean(itemErrors.additional[cost.key])}
                              className="text-right"
                              aria-label="Valor do custo adicional"
                            />
                          </div>
                          <button
                            type="button"
                            title="Remover custo adicional"
                            aria-label="Remover custo adicional"
                            onClick={() => removeAdditionalCost(item.key, cost.key)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-carbon-700 bg-carbon-800 text-titanium-muted transition-colors hover:bg-carbon-700 hover:text-signal-risk focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {Object.entries(itemErrors.additional).map(([costKey, message]) =>
                        message ? (
                          <p key={costKey} className="text-body-sm text-carmine-signal">
                            {message}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button type="button" variant="secondary" size="md" onClick={addItem}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar outro item
        </Button>
      </section>

      {/* Prévia de totais */}
      <section className="rounded border border-carbon-700/80 bg-carbon-900 p-space-md">
        <div className="mb-3 flex items-center gap-2 border-b border-carbon-800 pb-2">
          <Info className="h-4 w-4 text-titanium-muted" />
          <h2 className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
            Prévia de totais (local)
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-space-sm md:grid-cols-4">
          <div className="flex flex-col gap-1 rounded border border-carbon-800 bg-carbon-950/50 p-2">
            <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
              Subtotal
            </span>
            <span className="text-right font-mono text-body-md text-ice-white">
              {formatCurrencyBRL(totals.subtotal)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded border border-carbon-800 bg-carbon-950/50 p-2">
            <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
              Descontos
            </span>
            <span className="text-right font-mono text-body-md text-signal-hold">
              -{formatCurrencyBRL(totals.discountTotal)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded border border-carbon-800 bg-carbon-950/50 p-2">
            <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
              Custos adicionais
            </span>
            <span className="text-right font-mono text-body-md text-signal-hold">
              +{formatCurrencyBRL(totals.additionalTotal)}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded border border-carbon-700 bg-carbon-950 p-2">
            <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
              Total previsto
            </span>
            <span className="text-right font-mono text-headline-sm font-bold text-ice-white">
              {formatCurrencyBRL(totals.grandTotal)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-body-sm font-body-sm text-titanium-muted">
          Prévia calculada no navegador apenas para conferência. O valor oficial é calculado no
          servidor ao salvar o rascunho.
        </p>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-carbon-800 pt-3">
        <Link href={isEditing && orderId ? `/compras/${orderId}` : "/compras"}>
          <Button type="button" variant="secondary" size="md" disabled={saving}>
            Cancelar
          </Button>
        </Link>
        <Button type="submit" variant="primary" size="md" disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando…" : isEditing ? "Salvar alterações" : "Salvar rascunho"}
        </Button>
      </div>

      <p className="text-center text-body-sm font-body-sm text-titanium-muted">
        Ao salvar, o pedido permanece em rascunho. Submissão e emissão são etapas separadas, com
        aprovação humana pela matriz de alçadas.
      </p>

      <div aria-live="polite" className="sr-only">
        {saving ? "Salvando pedido de compra." : "Formulário pronto."}
      </div>
    </form>
  );
}

function formatQuantityLabel(text: string): string {
  const quantity = parseQuantity(text);
  if (!Number.isFinite(quantity) || quantity <= 0) return "quantidade não informada";
  return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}
