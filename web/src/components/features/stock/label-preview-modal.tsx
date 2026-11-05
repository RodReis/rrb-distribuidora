"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Printer, X, QrCode } from "lucide-react";
import { qrCodeSvg } from "@/lib/stock/qr-code";

export interface LabelPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  remnant: any;
  objectType?: "lote" | "retalho";
}

export function LabelPreviewModal({
  isOpen,
  onClose,
  remnant,
  objectType = "retalho",
}: LabelPreviewModalProps) {
  const [labelUrl, setLabelUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLabelUrl(null);
    setLoading(false);
  }, [isOpen, remnant?.id, objectType]);

  async function issueLabel() {
    if (!remnant?.id || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/stock/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectType, objectId: remnant.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Falha ao emitir etiqueta.");
      setLabelUrl(`${window.location.origin}${result.data.path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao emitir etiqueta.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !remnant) return null;
  const qrData = labelUrl
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCodeSvg(labelUrl))}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xs animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded bg-carbon-900 border border-carbon-700 p-5 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-carbon-800">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-tertiary" />
            <h3 className="text-headline-sm font-semibold text-ice-white">
              Etiqueta Industrial (Zebra / Argox)
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-titanium-muted hover:text-ice-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <style>{`@media print { body * { visibility: hidden !important; } #stock-label-print, #stock-label-print * { visibility: visible !important; } #stock-label-print { position: fixed; inset: 0 auto auto 0; width: 80mm; padding: 8mm; background: white; } }`}</style>
        <div
          id="stock-label-print"
          className="my-4 p-4 bg-paper text-ink rounded shadow-md border-2 border-carbon-700 font-mono text-label-code"
        >
          <div className="flex items-center justify-between border-b border-ink pb-2 mb-2">
            <div>
              <span className="font-bold text-sm tracking-wider uppercase block">
                METALAGENTS INDUSTRIAL
              </span>
              <span className="text-[10px] text-gray-700">RASTREABILIDADE 2D/3D // RF-04</span>
            </div>
            <span className="text-sm font-black bg-ink text-white px-2 py-0.5 rounded">
              #{remnant.code ?? remnant.lotNumber}
            </span>
          </div>

          <div className="text-xs font-bold leading-tight uppercase mb-2">
            {remnant.productDescription || "Produto"}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] border-b border-ink pb-2 mb-2">
            {objectType === "lote" ? (
              <>
                <div>
                  <span className="text-gray-600 block text-[9px]">SALDO ATUAL:</span>
                  <span className="font-bold">
                    {remnant.quantityCurrent} {remnant.unit}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[9px]">DEPÓSITO:</span>
                  <span className="font-bold">{remnant.warehouseName}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-gray-600 block text-[9px]">DIMENSÕES:</span>
                  <span className="font-bold">
                    {remnant.widthMm} x {remnant.lengthMm} mm
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[9px]">ESPESSURA:</span>
                  <span className="font-bold">{remnant.thicknessMm} mm</span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[9px]">PESO LÍQUIDO:</span>
                  <span className="font-bold">{remnant.weightKg} kg</span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[9px]">CORRIDA USINA:</span>
                  <span className="font-bold">{remnant.parentHeatNumber || "S/N"}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-gray-700">
              <div>
                LOCAL: <strong>{remnant.locationAddress || "—"}</strong>
              </div>
              <div>DATA: {new Date().toLocaleDateString("pt-BR")}</div>
            </div>

            <div className="flex flex-col items-center gap-1">
              {qrData ? (
                <Image
                  className="h-20 w-20"
                  src={qrData}
                  alt="QR Code da etiqueta"
                  width={80}
                  height={80}
                  unoptimized
                />
              ) : (
                <button
                  type="button"
                  onClick={issueLabel}
                  disabled={loading}
                  className="w-20 h-20 grid place-items-center border border-ink text-center text-[10px] disabled:opacity-60"
                >
                  {loading ? "Emitindo…" : "Emitir QR"}
                </button>
              )}
              <span className="text-[8px]">LEITURA AUTENTICADA</span>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-carbon-800 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="md" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={loading}
            onClick={qrData ? () => window.print() : issueLabel}
          >
            <Printer className="w-4 h-4 mr-1.5" /> {qrData ? "Imprimir etiqueta" : "Emitir QR"}
          </Button>
        </div>
      </div>
    </div>
  );
}
