"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Printer, X, QrCode } from "lucide-react";

export interface LabelPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  remnant: any;
}

export function LabelPreviewModal({ isOpen, onClose, remnant }: LabelPreviewModalProps) {
  if (!isOpen || !remnant) return null;

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

        {/* Physical Industrial Label Mockup Preview */}
        <div className="my-4 p-4 bg-ice-white text-carbon-950 rounded shadow-md border-2 border-carbon-700 font-mono text-label-code">
          <div className="flex items-center justify-between border-b border-carbon-950 pb-2 mb-2">
            <div>
              <span className="font-bold text-sm tracking-wider uppercase block">
                METALAGENTS INDUSTRIAL
              </span>
              <span className="text-[10px] text-gray-700">RASTREABILIDADE 2D/3D // RF-04</span>
            </div>
            <span className="text-sm font-black bg-carbon-950 text-white px-2 py-0.5 rounded">
              #{remnant.code}
            </span>
          </div>

          <div className="text-xs font-bold leading-tight uppercase mb-2">
            {remnant.productDescription || "CHAPA GROSSA A36"}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] border-b border-carbon-950 pb-2 mb-2">
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
              <span className="font-bold">{remnant.parentHeatNumber || "C-99412B"}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[10px] text-gray-700">
              <div>
                LOCAL: <strong>{remnant.locationAddress}</strong>
              </div>
              <div>DATA: {new Date().toLocaleDateString("pt-BR")}</div>
            </div>

            {/* QR Code */}
            <div className="w-12 h-12 bg-white p-0.5 border border-carbon-950 rounded flex items-center justify-center">
              <svg
                className="w-full h-full text-carbon-950"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M2 2h8v8H2zM4 4v4h4V4zm10-2h8v8h-8zm2 2v4h4V4zM2 14h8v8H2zm2 2v4h4v-4zm10 0h3v3h-3zm5 0h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z" />
              </svg>
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
            onClick={() => {
              toast.success(`Comando ZPL enviado para a impressora Zebra Pátio Central.`);
              onClose();
            }}
          >
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir na Zebra Pátio
          </Button>
        </div>
      </div>
    </div>
  );
}
