"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShoppingCart, CheckCircle2, AlertCircle, X, Factory } from "lucide-react";

export interface PurchaseSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
}

export function PurchaseSuggestionModal({ isOpen, onClose, item }: PurchaseSuggestionModalProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [orderConfirmed, setOrderConfirmed] = React.useState(false);

  if (!isOpen || !item) return null;

  const suggestedQty = Number(item.suggestedPurchaseQty) || 45;
  const leadTime = Number(item.leadTimeDays) || 14;
  const supplierName = item.erpCode?.includes("GERDAU")
    ? "Gerdau Ouro Branco"
    : item.erpCode?.includes("CSN")
      ? "CSN Volta Redonda"
      : item.erpCode?.includes("USIMINAS")
        ? "Usiminas Ipatinga"
        : "Usina Homologada";

  async function handleConfirmPO() {
    setSubmitting(true);
    try {
      // In MVP-02 this establishes the PO proposal for RFQ/Purchases
      await new Promise((r) => setTimeout(r, 600));
      setOrderConfirmed(true);
      toast.success(
        `Ordem de Compra Preventiva para ${suggestedQty}t (${supplierName}) gerada e enviada ao módulo de Compras!`
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao emitir ordem de compra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xs animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded bg-carbon-900 border border-carbon-700 p-5 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-3 border-b border-carbon-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-carmine-core/20 text-carmine-signal border border-carmine-core/40">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-headline-sm font-semibold text-ice-white">
                Emitir Pedido de Compra Preventivo
              </h3>
              <p className="text-body-sm text-titanium-muted">
                Sugestão algorítmica para evitar ruptura de estoque no armazém.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-titanium-muted hover:text-ice-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-3 font-sans">
          <div className="p-3 bg-carbon-950 border border-carbon-800 rounded">
            <div className="text-body-sm text-titanium-muted">Produto:</div>
            <div className="text-body-lg font-bold text-ice-white mt-0.5">
              {item.commercialDescription}
            </div>
            <div className="font-mono text-label-code text-titanium-light mt-1">
              SKU: {item.sku} • Norma: {item.norm}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-label-code">
            <div className="p-3 bg-carbon-950 border border-carbon-800 rounded">
              <span className="text-titanium-muted block">Quantidade Sugerida:</span>
              <span className="text-metric-display text-signal-buy font-bold">
                {suggestedQty} {item.unit || "t"}
              </span>
            </div>

            <div className="p-3 bg-carbon-950 border border-carbon-800 rounded">
              <span className="text-titanium-muted block">Lead Time Usina:</span>
              <span className="text-metric-display text-ice-white font-bold">{leadTime} dias</span>
            </div>
          </div>

          <div className="p-3 bg-carbon-950 border border-carbon-800 rounded flex items-center justify-between font-mono text-label-code">
            <span className="text-titanium-muted">Fornecedor Padrão Homologado:</span>
            <span className="text-ice-white font-semibold flex items-center gap-1">
              <Factory className="w-3.5 h-3.5 text-tertiary" /> {supplierName}
            </span>
          </div>

          <div className="p-3 bg-carmine-core/10 border border-carmine-core/30 rounded text-carmine-signal text-body-sm">
            <strong>Alerta Preventivo:</strong> A cobertura física atual deste item é de apenas{" "}
            {item.coverageDays} dias. Se o pedido não for emitido hoje, haverá ruptura antes do lead
            time de {leadTime} dias.
          </div>
        </div>

        <div className="pt-3 border-t border-carbon-800 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Fechar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirmPO}
            disabled={submitting || orderConfirmed}
          >
            {orderConfirmed ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-white" /> PO GERADA #PO-9410
              </span>
            ) : submitting ? (
              "Processando..."
            ) : (
              `Gerar PO de ${suggestedQty}t na Usina`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
