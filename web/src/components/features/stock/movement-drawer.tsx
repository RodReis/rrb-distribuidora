"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { createStockEntryAction, createStockOutAction } from "@/app/(app)/estoque/actions";

export interface MovementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  warehouses: any[];
  suppliers: any[];
  onMovementCreated?: () => void;
}

export function MovementDrawer({
  isOpen,
  onClose,
  products,
  warehouses,
  suppliers,
  onMovementCreated,
}: MovementDrawerProps) {
  const [movementType, setMovementType] = React.useState<"ENTRY" | "OUT">("ENTRY");
  const [productId, setProductId] = React.useState(products[0]?.id || "");
  const [warehouseId, setWarehouseId] = React.useState(warehouses[0]?.id || "");
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id || "");
  const [lotNumber, setLotNumber] = React.useState("");
  const [heatNumber, setHeatNumber] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [locationAddress, setLocationAddress] = React.useState("Galpão Central - Box B-01");
  const [referenceDocument, setReferenceDocument] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (products.length > 0 && !productId) setProductId(products[0].id);
    if (warehouses.length > 0 && !warehouseId) setWarehouseId(warehouses[0].id);
    if (suppliers.length > 0 && !supplierId) setSupplierId(suppliers[0].id);
  }, [products, warehouses, suppliers, productId, warehouseId, supplierId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Informe uma quantidade válida maior que zero.");
      return;
    }

    setSubmitting(true);
    try {
      if (movementType === "ENTRY") {
        const cost = parseFloat(unitCost);
        if (isNaN(cost) || cost < 0) {
          toast.error("Informe um custo unitário válido.");
          setSubmitting(false);
          return;
        }
        if (!lotNumber) {
          toast.error("Informe o número do lote.");
          setSubmitting(false);
          return;
        }

        await createStockEntryAction({
          productId,
          warehouseId,
          supplierId: supplierId || undefined,
          lotNumber,
          heatNumber: heatNumber || undefined,
          quantity: qty,
          unitCost: cost,
          locationAddress,
          referenceDocument,
          notes,
        });

        toast.success(`Entrada de estoque e lote #${lotNumber} registrados com sucesso!`);
      } else {
        // Find lot or register out
        toast.info("Para saída manual, selecione o lote na tabela de lotes.");
      }

      onMovementCreated?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar apontamento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Apontamento de Estoque Físico"
      subtitle="Registro de entrada por compra de lote ou requisição de corte com rastreabilidade de corrida."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processando..." : "Confirmar Movimentação"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-4 font-sans">
        {/* Movement Type Toggle */}
        <div className="flex items-center gap-2 p-1 bg-carbon-950 border border-carbon-800 rounded font-mono text-label-code">
          <button
            type="button"
            onClick={() => setMovementType("ENTRY")}
            className={cn(
              "flex-1 py-1.5 rounded transition-colors font-semibold",
              movementType === "ENTRY"
                ? "bg-carmine-core text-ice-white"
                : "text-titanium-muted hover:text-ice-white"
            )}
          >
            ENTRADA POR COMPRA (LOTE NOVO)
          </button>
          <button
            type="button"
            onClick={() => setMovementType("OUT")}
            className={cn(
              "flex-1 py-1.5 rounded transition-colors font-semibold",
              movementType === "OUT"
                ? "bg-carmine-core text-ice-white"
                : "text-titanium-muted hover:text-ice-white"
            )}
          >
            BAIXA / SAÍDA DE ESTOQUE
          </button>
        </div>

        {/* Product Select */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Produto Metálico / SKU
          </label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.commercialDescription}
              </option>
            ))}
          </Select>
        </div>

        {/* Warehouse & Supplier */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Depósito / Armazém
            </label>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Fornecedor / Usina
            </label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tradeName || s.legalName}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Lot and Heat Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Número do Lote
            </label>
            <input
              type="text"
              required
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Ex: LT-GD-9941"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Número de Corrida (Heat Number)
            </label>
            <input
              type="text"
              value={heatNumber}
              onChange={(e) => setHeatNumber(e.target.value)}
              placeholder="Ex: #C-99412B"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>
        </div>

        {/* Quantity and Unit Cost */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Quantidade de Entrada
            </label>
            <input
              type="number"
              step="0.0001"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.0000"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Custo Unitário (R$)
            </label>
            <CurrencyInput
              required
              value={unitCost === "" ? null : Number(unitCost)}
              onValueChange={(value) => setUnitCost(value ? String(value) : "")}
              placeholder="0,00"
              aria-label="Custo unitário em reais"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>
        </div>

        {/* Location and Document */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Localização Física / Box
            </label>
            <input
              type="text"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="Galpão Central - Box B-01"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>

          <div>
            <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
              Documento Fiscal / Chave NF-e
            </label>
            <input
              type="text"
              value={referenceDocument}
              onChange={(e) => setReferenceDocument(e.target.value)}
              placeholder="NF-e #441029"
              className="w-full bg-carbon-950 text-ice-white font-mono text-body-sm px-3 py-1.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="font-mono text-label-code text-titanium-muted uppercase block mb-1">
            Observações Técnicas / OP
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações do apontamento..."
            className="w-full bg-carbon-950 text-ice-white font-sans text-body-sm p-2.5 rounded border border-carbon-700 focus:outline-none focus:border-carmine-core"
          />
        </div>
      </form>
    </FormDrawer>
  );
}
