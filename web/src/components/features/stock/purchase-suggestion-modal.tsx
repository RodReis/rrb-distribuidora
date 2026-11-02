"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, X } from "lucide-react";

export interface PurchaseSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function PurchaseSuggestionModal({ isOpen, onClose, item }: PurchaseSuggestionModalProps) {
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const suggestedQty = Number(item.suggestedPurchaseQty) || 0;
  const leadTime = Number(item.leadTimeDays) || 0;
  const coverage = Number(item.coverageDays) || 0;
  const unit = item.unit || "t";
  const buyBy = item.suggestedPurchaseDate ? new Date(item.suggestedPurchaseDate) : new Date();
  const ruptureDate = new Date(Date.now() + coverage * 24 * 60 * 60 * 1000);
  const willBreak = coverage < leadTime;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sugestão de compra preventiva"
    >
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
                Sugestão de Compra Preventiva
              </h3>
              <p className="text-body-sm text-titanium-muted">
                Cálculo determinístico: ROP = consumo × lead time + estoque de segurança.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-titanium-muted hover:text-ice-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
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
                {suggestedQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {unit}
              </span>
            </div>

            <div className="p-3 bg-carbon-950 border border-carbon-800 rounded">
              <span className="text-titanium-muted block">Lead Time:</span>
              <span className="text-metric-display text-ice-white font-bold">{leadTime} dias</span>
            </div>
          </div>

          <div className="p-3 bg-carbon-950 border border-carbon-800 rounded text-body-sm text-titanium-light">
            Comprar{" "}
            <strong className="font-mono text-ice-white">
              {suggestedQty.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {unit}
            </strong>{" "}
            até <strong className="font-mono text-ice-white">{formatDate(buyBy)}</strong> para
            evitar ruptura em{" "}
            <strong className="font-mono text-ice-white">{formatDate(ruptureDate)}</strong>.
          </div>

          {willBreak && (
            <div className="p-3 bg-carmine-core/10 border border-carmine-core/30 rounded text-carmine-signal text-body-sm">
              <strong>Alerta:</strong> a cobertura atual é de {coverage} dias, menor que o lead time
              de {leadTime} dias. Mesmo comprando hoje, pode haver ruptura antes da entrega.
            </div>
          )}

          <p className="text-body-sm text-titanium-muted">
            A emissão do pedido de compra depende do módulo de Compras, ainda não disponível.
          </p>
        </div>

        <div className="pt-3 border-t border-carbon-800 flex items-center justify-end">
          <Button variant="secondary" size="md" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
