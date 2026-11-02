"use client";

import * as React from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { createRemnantAction } from "@/app/(app)/estoque/actions";
import { calculateRemnantWeight } from "@/lib/stock/remnants-engine";
import { Sparkles } from "lucide-react";

export interface RemnantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  warehouses: any[];
  onRemnantCreated?: () => void;
}

export function RemnantDrawer({
  isOpen,
  onClose,
  products,
  warehouses,
  onRemnantCreated,
}: RemnantDrawerProps) {
  const [productId, setProductId] = React.useState(products[0]?.id || "");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id || "");
  const [thicknessMm, setThicknessMm] = React.useState("6.35");
  const [widthMm, setWidthMm] = React.useState("1000");
  const [lengthMm, setLengthMm] = React.useState("1500");
  const [diameterMm, setDiameterMm] = React.useState("");
  const [locationAddress, setLocationAddress] = React.useState("Galpão Central - Box B-02");
  const [notes, setNotes] = React.useState("Sobra de corte Laser Fibra");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (products.length > 0 && !productId) setProductId(products[0].id);
    if (warehouses.length > 0 && !warehouseId) setWarehouseId(warehouses[0].id);
  }, [products, warehouses, productId, warehouseId]);

  // Live theoretical weight
  const selectedProduct = products.find((p) => p.id === productId);
  const calculatedWeight = React.useMemo(() => {
    const t = parseFloat(thicknessMm);
    const w = parseFloat(widthMm);
    const l = parseFloat(lengthMm);
    const d = parseFloat(diameterMm);

    if (isNaN(t) || t <= 0) return 0;

    return calculateRemnantWeight({
      family: selectedProduct?.family || "chapa_grossa",
      norm: selectedProduct?.norm,
      densityGCm3: selectedProduct?.densityGCm3 ? Number(selectedProduct.densityGCm3) : 7.85,
      thicknessMm: t,
      widthMm: !isNaN(w) && w > 0 ? w : undefined,
      lengthMm: !isNaN(l) && l > 0 ? l : undefined,
      diameterMm: !isNaN(d) && d > 0 ? d : undefined,
    });
  }, [thicknessMm, widthMm, lengthMm, diameterMm, selectedProduct]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const t = parseFloat(thicknessMm);
    if (isNaN(t) || t <= 0) {
      toast.error("Espessura inválida.");
      return;
    }

    setSubmitting(true);
    try {
      const remnant = await createRemnantAction({
        productId,
        warehouseId,
        thicknessMm: t,
        widthMm: widthMm ? parseFloat(widthMm) : undefined,
        lengthMm: lengthMm ? parseFloat(lengthMm) : undefined,
        diameterMm: diameterMm ? parseFloat(diameterMm) : undefined,
        weightKg: calculatedWeight,
        locationAddress,
        notes,
      });

      toast.success(
        `Retalho #${remnant.code} cadastrado com sucesso! Peso Teórico: ${calculatedWeight} kg`
      );
      onRemnantCreated?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar retalho.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="+ Cadastrar Novo Retalho (Offcut 2D/3D)"
      subtitle="Catalogação de sobra residual de corte como ativo reaproveitável com rastreabilidade dimensional."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar Retalho no Catálogo"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-4 font-sans">
        {/* Product Select */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Produto / Liga de Origem
          </label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.commercialDescription}
              </option>
            ))}
          </Select>
        </div>

        {/* Warehouse */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Depósito / Armazém de Estocagem
          </label>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Espessura [mm]
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={thicknessMm}
              onChange={(e) => setThicknessMm(e.target.value)}
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Largura [mm]
            </label>
            <input
              type="number"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Comprimento [mm]
            </label>
            <input
              type="number"
              value={lengthMm}
              onChange={(e) => setLengthMm(e.target.value)}
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>
        </div>

        {/* Live Weight Tile */}
        <div className="p-3 bg-carbon-950 border border-carbon-800 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-tertiary" />
            <div>
              <span className="font-mono text-label-code text-titanium-muted uppercase block">
                Peso Líquido Calculado Automaticamente:
              </span>
              <span className="font-mono text-metric-display text-signal-buy font-bold">
                {calculatedWeight.toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 3,
                })}{" "}
                kg
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-label-code text-titanium-muted">
            Densidade da Liga: {selectedProduct?.densityGCm3 || 7.85} g/cm³
          </div>
        </div>

        {/* Location Address */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Endereço Físico / Cavalete / Gaveta
          </label>
          <input
            type="text"
            required
            value={locationAddress}
            onChange={(e) => setLocationAddress(e.target.value)}
            placeholder="Ex: Cavalete B - Gaveta 04"
            className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Origem / Observações do Retalho
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Gerado pelo corte de flange na Máquina Laser CNC..."
            className="w-full bg-carbon-950 text-ice-white font-sans text-body-sm p-2.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
          />
        </div>
      </form>
    </FormDrawer>
  );
}
