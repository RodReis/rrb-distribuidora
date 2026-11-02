"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import type { BuilderCatalog } from "@/lib/quotes/builder-data";
import {
  AlertTriangle,
  Calculator,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { GeometryDrawer } from "./geometry-drawer";
import {
  CHANNEL_OPTIONS,
  DELIVERY_METHOD_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  PROCESS_LABELS,
  toApiItem,
  type BuilderItem,
  type QuoteFormState,
} from "./quote-types";

interface PreviewItem {
  index: number;
  sku: string;
  description: string;
  norm: string;
  geometryLabel: string;
  quantity: number;
  netWeightKg: number;
  grossWeightKg: number;
  scrapPct: number;
  unitMaterialCost: number;
  unitProcessCost: number;
  unitPrice: number;
  itemMarginPct: number;
  totalItemAmount: number;
  replacementCostPerKg: number;
  salePricePerKg: number;
  marketSymbol: string;
  processType: string;
  machineName: string | null;
  totalMinutes: number;
  belowReplacementCost: boolean;
  belowTargetMargin: boolean;
  usedRemnant: boolean;
  remnantCode: string | null;
}

interface Preview {
  items: PreviewItem[];
  summary: {
    totalMaterialCost: number;
    totalProcessCost: number;
    totalFreightCost: number;
    totalServicesCost: number;
    totalAmount: number;
    totalCost: number;
    grossMarginPct: number;
    blocked: boolean;
    blockReasons: string[];
  };
  volatilityPct: number;
  validUntil: string;
  validityHours: number;
  blocked: boolean;
  blockReasons: string[];
  minMarginPct: number;
}

type PreviewState = {
  signature: string;
  items: Map<string, PreviewItem>;
  preview: Preview;
};

export interface QuoteBuilderProps {
  catalog: BuilderCatalog;
  quoteId?: string;
  quoteNumberLabel?: string;
  statusLabel?: string;
  initialForm?: Partial<QuoteFormState>;
  initialItems?: BuilderItem[];
}

const DEFAULT_FORM = (catalog: BuilderCatalog): QuoteFormState => ({
  customerId: "",
  channel: "whatsapp",
  targetMarginPct: catalog.policy.defaultMarginPct,
  discountPct: 0,
  freightCost: 0,
  servicesCost: 0,
  paymentTerms: "",
  deliveryMethod: "",
  deliveryDeadline: "",
  bankingInfo: "",
  notes: "",
});

export function QuoteBuilder({
  catalog,
  quoteId,
  quoteNumberLabel,
  statusLabel,
  initialForm,
  initialItems,
}: QuoteBuilderProps) {
  const router = useRouter();
  const isEditing = !!quoteId;

  const [form, setForm] = React.useState<QuoteFormState>({
    ...DEFAULT_FORM(catalog),
    ...initialForm,
  });
  const [items, setItems] = React.useState<BuilderItem[]>(initialItems ?? []);
  const [drawerItem, setDrawerItem] = React.useState<BuilderItem | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [pendingRemove, setPendingRemove] = React.useState<BuilderItem | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [previewState, setPreviewState] = React.useState<PreviewState | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  function patch(next: Partial<QuoteFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  const payloadEntries = React.useMemo(
    () =>
      items
        .filter((item) => !!item.productId)
        .map((item) => ({ key: item.key, payload: toApiItem(item) })),
    [items]
  );

  const requestPayload = React.useMemo(
    () => ({
      channel: form.channel,
      targetMarginPct: form.targetMarginPct,
      discountPct: form.discountPct,
      freightCost: form.freightCost,
      servicesCost: form.servicesCost,
      items: payloadEntries.map((entry) => entry.payload),
    }),
    [
      form.channel,
      form.targetMarginPct,
      form.discountPct,
      form.freightCost,
      form.servicesCost,
      payloadEntries,
    ]
  );

  const signature = React.useMemo(() => JSON.stringify(requestPayload), [requestPayload]);

  React.useEffect(() => {
    if (requestPayload.items.length === 0) {
      setPreviewState(null);
      setPreviewError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/quotes/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          setPreviewError(json.error ?? "Não foi possível precificar os itens.");
          return;
        }
        const entries = payloadEntries;
        const map = new Map<string, PreviewItem>();
        (json.preview.items as PreviewItem[]).forEach((item, index) => {
          const entry = entries[index];
          if (entry) map.set(entry.key, item);
        });
        setPreviewError(null);
        setPreviewState({ signature, items: map, preview: json.preview as Preview });
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setPreviewError("Falha de conexão ao precificar o orçamento.");
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [requestPayload, payloadEntries, signature]);

  const activePreview = previewState?.signature === signature ? previewState : null;
  const preview = activePreview?.preview ?? null;
  const previewByKey = React.useMemo(
    () => activePreview?.items ?? new Map<string, PreviewItem>(),
    [activePreview]
  );

  const totals = React.useMemo(() => {
    let net = 0;
    let gross = 0;
    for (const item of previewByKey.values()) {
      net += item.netWeightKg;
      gross += item.grossWeightKg;
    }
    return { net, gross };
  }, [previewByKey]);

  function upsertItem(item: BuilderItem) {
    setItems((current) => {
      const index = current.findIndex((existing) => existing.key === item.key);
      if (index === -1) return [...current, item];
      const next = [...current];
      next[index] = item;
      return next;
    });
    setDrawerOpen(false);
    setDrawerItem(null);
  }

  function removeItem(item: BuilderItem) {
    setItems((current) => current.filter((existing) => existing.key !== item.key));
    setPendingRemove(null);
  }

  async function handleSave() {
    if (!form.customerId) {
      toast.error("Selecione o cliente do orçamento.");
      return;
    }
    if (payloadEntries.length === 0) {
      toast.error("Inclua ao menos um item com produto selecionado.");
      return;
    }
    if (!form.deliveryMethod.trim()) {
      toast.error("Informe a modalidade de entrega.");
      return;
    }
    if (items.some((item) => !item.productId)) {
      toast.error("Existe item sem produto. Edite ou remova o item.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        customerId: form.customerId,
        channel: form.channel,
        targetMarginPct: form.targetMarginPct,
        discountPct: form.discountPct,
        freightCost: form.freightCost,
        servicesCost: form.servicesCost,
        paymentTerms: form.paymentTerms || null,
        deliveryMethod: form.deliveryMethod || null,
        deliveryDeadline: form.deliveryDeadline
          ? new Date(`${form.deliveryDeadline}T12:00:00`).toISOString()
          : null,
        bankingInfo: form.bankingInfo || null,
        notes: form.notes || null,
        items: payloadEntries.map((entry) => entry.payload),
      };

      const res = await fetch(isEditing ? `/api/quotes/${quoteId}` : "/api/quotes", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        const detail = json?.issues?.fieldErrors
          ? Object.values(json.issues.fieldErrors).flat().filter(Boolean)[0]
          : null;
        throw new Error(detail ?? json.error ?? "Não foi possível salvar o orçamento.");
      }

      const saved = json.quote;
      const numberLabel = `#${1000 + saved.quote.quoteNumber}`;
      toast.success(
        isEditing
          ? `Orçamento ${numberLabel} atualizado.`
          : `Orçamento ${numberLabel} criado com sucesso.`
      );
      router.push(`/vendas/orcamentos/${saved.quote.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const marginTone = (() => {
    if (!preview) return "text-titanium-light";
    if (preview.blocked) return "text-carmine-signal";
    if (preview.summary.grossMarginPct < preview.minMarginPct + 3) return "text-signal-hold";
    return "text-signal-buy";
  })();

  return (
    <div className="flex flex-col gap-space-md pb-4">
      <Breadcrumbs
        items={[
          { label: "Vendas & Orçamentos", href: "/vendas/orcamentos" },
          { label: "Orçamentos", href: "/vendas/orcamentos" },
          {
            label: isEditing ? `Editar ${quoteNumberLabel ?? "orçamento"}` : "Novo orçamento",
          },
        ]}
      />

      <div className="flex flex-col gap-space-md rounded border border-carbon-700/80 bg-carbon-900 p-space-md xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-ice-white">
              {isEditing ? `Editar orçamento ${quoteNumberLabel ?? ""}` : "Novo orçamento"}
            </h1>
            {statusLabel && (
              <span className="rounded border border-carbon-700 bg-carbon-800 px-2 py-0.5 font-label-code text-label-code text-titanium-light">
                {statusLabel}
              </span>
            )}
          </div>
          <p className="text-body-sm font-body-sm text-titanium-muted">
            Peso teórico, kerf, tempo de máquina e custo de reposição calculados no servidor a cada
            alteração.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded border border-signal-buy/30 bg-signal-buy/10 px-2 py-0.5 font-label-code text-label-code text-signal-buy">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-buy" />
            MOTOR DETERMINÍSTICO
          </span>
          <Link href="/vendas/orcamentos">
            <Button variant="ghost" size="md">
              Cancelar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-space-md">
          {/* DADOS COMERCIAIS */}
          <section className="rounded border border-carbon-700/80 bg-carbon-900">
            <header className="flex items-center justify-between border-b border-carbon-700/80 bg-carbon-950 px-space-md py-2.5">
              <span className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
                Dados comerciais
              </span>
              <span className="font-label-code text-label-code text-titanium-muted">
                Margem mínima da política {formatNumberBR(catalog.policy.minMarginPct, 2)}%
              </span>
            </header>

            <div className="grid grid-cols-1 gap-3 p-space-md sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Cliente</FieldLabel>
                <SelectMenu
                  value={form.customerId}
                  onChange={(value) => patch({ customerId: value })}
                  options={catalog.customers.map((customer) => ({
                    value: customer.id,
                    label: `${customer.tradeName || customer.legalName} · ${customer.document}`,
                  }))}
                  placeholder="Selecione o cliente"
                  aria-label="Cliente"
                />
              </div>

              <div>
                <FieldLabel>Canal de atendimento</FieldLabel>
                <SelectMenu
                  value={form.channel}
                  onChange={(value) => patch({ channel: value })}
                  options={CHANNEL_OPTIONS}
                  aria-label="Canal de atendimento"
                />
              </div>

              <div>
                <FieldLabel>Margem alvo (%)</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  max={95}
                  step="0.5"
                  value={form.targetMarginPct}
                  onChange={(event) => patch({ targetMarginPct: Number(event.target.value) || 0 })}
                />
              </div>

              <div>
                <FieldLabel>Desconto comercial (%)</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  step="0.5"
                  value={form.discountPct}
                  onChange={(event) => patch({ discountPct: Number(event.target.value) || 0 })}
                />
              </div>

              <div>
                <FieldLabel>Frete (R$)</FieldLabel>
                <CurrencyInput
                  value={form.freightCost}
                  onValueChange={(value) => patch({ freightCost: value })}
                  placeholder="0,00"
                  aria-label="Frete em reais"
                />
              </div>

              <div>
                <FieldLabel>Serviços de terceiros (R$)</FieldLabel>
                <CurrencyInput
                  value={form.servicesCost}
                  onValueChange={(value) => patch({ servicesCost: value })}
                  placeholder="0,00"
                  aria-label="Serviços de terceiros em reais"
                />
              </div>

              <div>
                <FieldLabel>Condição de pagamento</FieldLabel>
                <SelectMenu
                  value={form.paymentTerms}
                  onChange={(value) => patch({ paymentTerms: value })}
                  options={PAYMENT_TERMS_OPTIONS}
                  placeholder="A combinar"
                  aria-label="Condição de pagamento"
                />
              </div>

              <div>
                <FieldLabel>Modalidade de entrega *</FieldLabel>
                <SelectMenu
                  value={form.deliveryMethod}
                  onChange={(value) => patch({ deliveryMethod: value })}
                  options={DELIVERY_METHOD_OPTIONS}
                  placeholder="Selecione a modalidade"
                  aria-label="Modalidade de entrega"
                />
              </div>

              <div>
                <FieldLabel>Prazo de entrega</FieldLabel>
                <Input
                  type="date"
                  value={form.deliveryDeadline}
                  onChange={(event) => patch({ deliveryDeadline: event.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <FieldLabel>Dados bancários / PIX</FieldLabel>
                <Input
                  value={form.bankingInfo}
                  onChange={(event) => patch({ bankingInfo: event.target.value })}
                  placeholder="Banco, agência, conta ou chave PIX"
                />
              </div>

              <div className="sm:col-span-2">
                <FieldLabel>Observações da proposta</FieldLabel>
                <textarea
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                  rows={3}
                  placeholder="Condições técnicas, tolerâncias e observações comerciais"
                  className="w-full rounded border border-carbon-700 bg-carbon-950 px-3 py-2 text-body-md text-ice-white placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                />
              </div>
            </div>
          </section>

          {/* ITENS */}
          <section className="overflow-hidden rounded border border-carbon-700/80 bg-carbon-900">
            <header className="flex items-center justify-between border-b border-carbon-700/80 bg-carbon-950 px-space-md py-2.5">
              <span className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
                Itens do orçamento
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-carbon-700 bg-carbon-800 px-2 py-0.5 font-label-code text-label-code text-titanium-light">
                  {items.length} item(ns)
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setDrawerItem(null);
                    setDrawerOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Adicionar item
                </Button>
              </div>
            </header>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-space-md py-10 text-center">
                <Calculator className="h-8 w-8 text-titanium-steel" />
                <p className="text-body-md text-titanium-light">Nenhum item no orçamento ainda.</p>
                <p className="max-w-md text-body-sm text-titanium-muted">
                  Adicione chapas, discos, barras ou tubos. O sistema calcula peso teórico, perda de
                  corte e tempo de máquina automaticamente.
                </p>
                <Button
                  size="md"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    setDrawerItem(null);
                    setDrawerOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar primeiro item
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-body-sm">
                  <thead className="border-b border-carbon-700/80 bg-carbon-950/80 font-label-caps text-label-caps text-titanium-muted">
                    <tr>
                      <th className="px-3 py-2">Item / Especificação</th>
                      <th className="px-2 py-2 text-right">Qtd</th>
                      <th className="px-2 py-2 text-right">Peso líq.</th>
                      <th className="px-2 py-2 text-right">Custo unit.</th>
                      <th className="px-2 py-2 text-right">Preço unit.</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">Margem</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon-800/80">
                    {items.map((item) => {
                      const product = catalog.products.find((p) => p.id === item.productId);
                      const p = previewByKey.get(item.key);
                      return (
                        <tr key={item.key} className="transition-colors hover:bg-carbon-800/40">
                          <td className="px-3 py-2">
                            <div className="font-label-code text-label-code font-semibold text-ice-white">
                              {product?.sku ?? "—"}{" "}
                              <span className="font-body-sm font-normal text-titanium-light">
                                {product?.description ?? "Produto não selecionado"}
                              </span>
                            </div>
                            <div className="text-[10px] text-titanium-muted">
                              {p ? p.geometryLabel : formatItemGeometry(item)} ·{" "}
                              {PROCESS_LABELS[item.processType]}
                              {item.remnantCode ? ` · Retalho ${item.remnantCode}` : ""}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                            {item.quantity}
                          </td>
                          <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-light">
                            {p ? `${formatNumberBR(p.netWeightKg, 3)} kg` : "—"}
                          </td>
                          <td className="px-2 py-2 text-right font-label-code text-label-code text-titanium-muted">
                            {p ? formatCurrencyBRL(p.unitMaterialCost + p.unitProcessCost) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right font-label-code text-label-code text-ice-white">
                            {p ? formatCurrencyBRL(p.unitPrice) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right font-label-code text-label-code font-bold text-ice-white">
                            {p ? formatCurrencyBRL(p.totalItemAmount) : "—"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-label-code text-label-code ${
                              p?.belowReplacementCost ||
                              (p && p.itemMarginPct < catalog.policy.minMarginPct)
                                ? "text-carmine-signal font-bold"
                                : p?.belowTargetMargin
                                  ? "text-signal-hold"
                                  : "text-signal-buy"
                            }`}
                          >
                            {p ? `${formatNumberBR(p.itemMarginPct, 1)}%` : "—"}
                            {p?.belowReplacementCost && (
                              <span className="ml-1 text-[9px]">[REPOSIÇÃO]</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Editar item"
                                onClick={() => {
                                  setDrawerItem(item);
                                  setDrawerOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Remover item"
                                onClick={() => setPendingRemove(item)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-carmine-signal" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* RESUMO / PREÇO */}
        <aside className="flex flex-col gap-space-md xl:sticky xl:top-4">
          <section className="rounded border border-carbon-700/80 bg-carbon-900">
            <header className="flex items-center justify-between border-b border-carbon-700/80 bg-carbon-950 px-space-md py-2.5">
              <span className="font-label-caps text-label-caps font-bold uppercase tracking-wider text-ice-white">
                Resumo determinístico
              </span>
              {preview && (
                <span className="flex items-center gap-1 font-label-code text-label-code text-signal-buy">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-buy" /> atualizado
                </span>
              )}
            </header>

            <div className="flex flex-col gap-2 p-space-md">
              <SummaryLine
                label="Material (peso bruto)"
                value={preview?.summary.totalMaterialCost}
              />
              <SummaryLine label="Processo / máquina" value={preview?.summary.totalProcessCost} />
              <SummaryLine label="Frete" value={preview?.summary.totalFreightCost} />
              <SummaryLine
                label="Serviços de terceiros"
                value={preview?.summary.totalServicesCost}
              />

              <div className="my-1 border-t border-carbon-800" />
              <div className="flex items-baseline justify-between">
                <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
                  Total da proposta
                </span>
                <span className="font-metric-display text-metric-display font-bold text-ice-white">
                  {preview ? formatCurrencyBRL(preview.summary.totalAmount) : "R$ 0,00"}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="font-label-caps text-label-caps uppercase text-titanium-muted">
                  Margem bruta
                </span>
                <span className={`font-metric-regular text-metric-regular font-bold ${marginTone}`}>
                  {preview ? `${formatNumberBR(preview.summary.grossMarginPct, 2)}%` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between font-label-code text-label-code text-titanium-muted">
                <span>
                  Líquido {preview ? `${formatNumberBR(totals.net, 3)} kg` : "—"} · Bruto{" "}
                  {preview ? `${formatNumberBR(totals.gross, 3)} kg` : "—"}
                </span>
              </div>
            </div>
          </section>

          {previewError && (
            <div className="rounded border border-carmine-core/40 bg-carmine-dark/20 p-3 font-label-code text-label-code text-carmine-signal">
              <AlertTriangle className="mb-1 h-3.5 w-3.5" />
              {previewError}
            </div>
          )}

          {preview && preview.blocked && (
            <div className="rounded border-l-4 border-carmine-core border-y border-r border-carbon-700/70 bg-carbon-900 p-3">
              <p className="flex items-center gap-1.5 font-label-caps text-label-caps font-bold uppercase text-carmine-signal">
                <ShieldAlert className="h-4 w-4" /> Bloqueio de margem
              </p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 font-label-code text-label-code text-titanium-light">
                {preview.blockReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-titanium-muted">
                O orçamento será salvo como «Bloqueado por margem» e só poderá ser enviado após
                liberação do diretor.
              </p>
            </div>
          )}

          {preview && (
            <section className="rounded border border-carbon-700/80 bg-carbon-900 p-3">
              <p className="flex items-center gap-1.5 font-label-caps text-label-caps uppercase text-titanium-muted">
                <Truck className="h-3.5 w-3.5 text-tertiary" /> Validade preventiva
              </p>
              <p className="mt-1 font-metric-regular text-metric-regular font-semibold text-ice-white">
                {preview.validityHours}h — até{" "}
                {new Date(preview.validUntil).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-1 font-label-code text-label-code text-titanium-muted">
                Volatilidade semanal {formatNumberBR(preview.volatilityPct, 2)}%
                {preview.items[0]?.marketSymbol ? ` · índice ${preview.items[0].marketSymbol}` : ""}
              </p>
            </section>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEditing ? "Salvar alterações" : "Criar orçamento"}
              </>
            )}
          </Button>

          <p className="text-center font-label-code text-label-code text-titanium-muted">
            Todo valor é recalculado no servidor antes de persistir.
          </p>
        </aside>
      </div>

      <GeometryDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        products={catalog.products}
        machines={catalog.machines}
        initial={drawerItem}
        onSave={upsertItem}
      />

      <ConfirmDialog
        isOpen={!!pendingRemove}
        title="Remover item do orçamento?"
        description="O item será retirado da proposta. O recálculo de margem e validade acontece automaticamente."
        confirmLabel="Remover item"
        variant="danger"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove && removeItem(pendingRemove)}
      />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted">
      {children}
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-baseline justify-between font-body-sm text-body-sm">
      <span className="text-titanium-muted">{label}</span>
      <span className="font-label-code text-label-code text-titanium-light">
        {value == null ? "—" : formatCurrencyBRL(value)}
      </span>
    </div>
  );
}

function formatItemGeometry(item: BuilderItem): string {
  const n = (value: number | "") => (typeof value === "number" ? formatNumberBR(value, 2) : "?");
  switch (item.geometryType) {
    case "CHAPA_RETANGULAR":
      return `${n(item.lengthMm)} × ${n(item.widthMm)} mm`;
    case "DISCO":
      return `Ø ${n(item.diameterMm)} mm`;
    case "BARRA_CORTE":
      return `Ø ${n(item.diameterMm)} mm · corte ${n(item.lengthMm)} mm`;
    case "TUBO_CORTE":
      return `Ø ${n(item.diameterMm)} mm · parede ${n(item.wallMm)} mm`;
    default:
      return "Produto de catálogo";
  }
}
