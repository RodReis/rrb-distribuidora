"use client";

import * as React from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  calculateGeometry,
  estimateCutTimeMinutes,
  inferDensityFromNorm,
  KERF_MM,
  type GeometryResult,
} from "@/lib/metallurgy/weight-formulas";
import { formatCurrencyBRL, formatNumberBR } from "@/lib/utils";
import {
  AlertTriangle,
  Boxes,
  Calculator,
  CheckCircle2,
  Clock,
  Layers,
  Weight,
} from "lucide-react";
import { toast } from "sonner";
import type { BuilderMachine, BuilderProduct } from "@/lib/quotes/builder-data";
import { GEOMETRY_OPTIONS, PROCESS_OPTIONS, type BuilderItem } from "./quote-types";

interface RemnantMatch {
  remnant: {
    id: string;
    code: string;
    productSku: string;
    productDescription: string;
    thicknessMm: number;
    widthMm: number | null;
    lengthMm: number | null;
    diameterMm: number | null;
    weightKg: number;
    locationAddress: string | null;
    warehouseName: string;
  };
  isRotated: boolean;
  wastePercentage: number;
  mechanicalEfficiencyPct: number;
  salvagedWeightKg: number;
}

export interface GeometryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: BuilderProduct[];
  machines: BuilderMachine[];
  initial: BuilderItem | null;
  onSave: (item: BuilderItem) => void;
}

function numberOrEmpty(value: number | ""): number | "" {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

export function GeometryDrawer({
  isOpen,
  onClose,
  products,
  machines,
  initial,
  onSave,
}: GeometryDrawerProps) {
  const [draft, setDraft] = React.useState<BuilderItem>(
    initial ?? {
      key: `item-${Date.now()}`,
      productId: "",
      remnantId: null,
      remnantCode: null,
      geometryType: "CHAPA_RETANGULAR",
      thicknessMm: "",
      widthMm: "",
      lengthMm: "",
      diameterMm: "",
      innerDiameterMm: "",
      wallMm: "",
      quantity: 1,
      processType: "laser",
      machineId: "",
      setupMinutes: "",
      manualUnitPrice: "",
    }
  );
  const [matches, setMatches] = React.useState<RemnantMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = React.useState(false);

  /** Máquina padrão para o processo: evita abrir o item com um processo
   *  diferente do equipamento selecionado (ex.: laser com dobradeira). */
  const machineForProcess = React.useCallback(
    (process: string) => machines.find((m) => m.type === process) ?? null,
    [machines]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft(
      initial
        ? { ...initial }
        : {
            key: `item-${Date.now()}`,
            productId: products[0]?.id ?? "",
            remnantId: null,
            remnantCode: null,
            geometryType: "CHAPA_RETANGULAR",
            thicknessMm: "",
            widthMm: "",
            lengthMm: "",
            diameterMm: "",
            innerDiameterMm: "",
            wallMm: "",
            quantity: 1,
            processType: "laser",
            machineId: machineForProcess("laser")?.id ?? machines[0]?.id ?? "",
            setupMinutes: "",
            manualUnitPrice: "",
          }
    );
    setMatches([]);
  }, [isOpen, initial, products, machines, machineForProcess]);

  const product = products.find((p) => p.id === draft.productId) ?? null;
  const machine = machines.find((m) => m.id === draft.machineId) ?? null;

  const productOptions = React.useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.sku} · ${p.description}`,
      })),
    [products]
  );

  const machineOptions = React.useMemo(
    () => [
      { value: "", label: "Sem máquina (apenas material)" },
      ...machines.map((m) => ({
        value: m.id,
        label: `${m.name} · ${m.type} · ${formatCurrencyBRL(m.costPerHour)}/h`,
      })),
    ],
    [machines]
  );

  function patch(next: Partial<BuilderItem>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function handleProductChange(productId: string) {
    const next = products.find((p) => p.id === productId);
    if (!next) {
      patch({ productId });
      return;
    }

    const geometryType =
      next.family === "tubo"
        ? "TUBO_CORTE"
        : next.family === "barra" || next.family === "perfil"
          ? "BARRA_CORTE"
          : "CHAPA_RETANGULAR";

    patch({
      productId,
      remnantId: null,
      remnantCode: null,
      geometryType,
      thicknessMm: numberOrEmpty(next.thicknessMm ?? ""),
      widthMm: numberOrEmpty(next.widthMm ?? ""),
      lengthMm: numberOrEmpty(next.lengthMm ?? ""),
      diameterMm: numberOrEmpty(next.diameterMm ?? ""),
      wallMm: numberOrEmpty(next.wallMm ?? ""),
    });
  }

  function handleMachineChange(machineId: string) {
    const next = machines.find((m) => m.id === machineId);
    const process =
      next && ["laser", "plasma", "oxicorte", "serra", "guilhotina", "dobra"].includes(next.type)
        ? (next.type as BuilderItem["processType"])
        : draft.processType;
    patch({
      machineId,
      processType: process,
      setupMinutes: next ? next.setupMin : draft.setupMinutes,
    });
  }

  /** Trocar o processo troca também a máquina, para o custo de hora refletir
   *  o equipamento que realmente executa o corte. */
  function handleProcessChange(process: BuilderItem["processType"]) {
    const next = machineForProcess(process);
    patch({
      processType: process,
      machineId: next?.id ?? "",
      setupMinutes: next ? next.setupMin : draft.setupMinutes,
    });
  }

  const density = React.useMemo(() => {
    if (product?.densityGCm3 && product.densityGCm3 > 0) return product.densityGCm3;
    return inferDensityFromNorm(product?.norm, product?.family);
  }, [product]);

  const geometry = React.useMemo<GeometryResult | null>(() => {
    if (!product) return null;
    try {
      return calculateGeometry({
        geometryType: draft.geometryType,
        thicknessMm: numberOrEmpty(draft.thicknessMm) || null,
        widthMm: numberOrEmpty(draft.widthMm) || null,
        lengthMm: numberOrEmpty(draft.lengthMm) || null,
        diameterMm: numberOrEmpty(draft.diameterMm) || null,
        innerDiameterMm: numberOrEmpty(draft.innerDiameterMm) || null,
        wallMm: numberOrEmpty(draft.wallMm) || null,
        weightPerUnitKg: product.weightPerUnit || null,
        densityGCm3: density,
        kerfMm: KERF_MM[draft.processType],
        quantity: draft.quantity,
      });
    } catch {
      return null;
    }
  }, [draft, density, product]);

  const cut = React.useMemo(() => {
    if (!geometry) return null;
    return estimateCutTimeMinutes({
      process: draft.processType,
      cutPathTotalMm: geometry.cutPathTotalMm,
      quantity: geometry.quantity,
      thicknessMm: numberOrEmpty(draft.thicknessMm) || 0,
      setupMinutes:
        typeof draft.setupMinutes === "number" ? draft.setupMinutes : (machine?.setupMin ?? 0),
    });
  }, [geometry, draft.processType, draft.thicknessMm, draft.setupMinutes, machine]);

  const processCost = React.useMemo(() => {
    if (!cut) return 0;
    return (cut.totalMinutes / 60) * (machine?.costPerHour ?? 0);
  }, [cut, machine]);

  // Busca de retalhos compatíveis (MVP-02) com debounce.
  React.useEffect(() => {
    if (!isOpen || !product) {
      setMatches([]);
      return;
    }

    const thickness = numberOrEmpty(draft.thicknessMm);
    if (!thickness) {
      setMatches([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingMatches(true);
      try {
        const params = new URLSearchParams({
          productId: product.id,
          geometryType: draft.geometryType,
          thicknessMm: String(thickness),
          widthMm: String(numberOrEmpty(draft.widthMm) || 0),
          lengthMm: String(numberOrEmpty(draft.lengthMm) || 0),
          diameterMm: String(numberOrEmpty(draft.diameterMm) || 0),
        });
        const res = await fetch(`/api/quotes/remnant-matches?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setMatches([]);
          return;
        }
        const json = await res.json();
        setMatches(json.matches ?? []);
      } catch {
        setMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    isOpen,
    product,
    draft.geometryType,
    draft.thicknessMm,
    draft.widthMm,
    draft.lengthMm,
    draft.diameterMm,
  ]);

  function handleSave() {
    if (!product) {
      toast.error("Selecione o produto metálico do item.");
      return;
    }
    if (!geometry) {
      toast.error("Confira as dimensões: há medidas inválidas ou ausentes.");
      return;
    }
    if (draft.quantity <= 0) {
      toast.error("A quantidade deve ser maior que zero.");
      return;
    }

    onSave({
      ...draft,
      setupMinutes: cut ? cut.setupMinutes : 0,
    });
  }

  const unitMaterialCost = React.useMemo(() => {
    if (!geometry) return 0;
    const costPerKg = product?.replacementCostPerKg ?? 0;
    return draft.remnantId
      ? geometry.netWeightPerPieceKg * costPerKg * 0.65
      : geometry.grossWeightPerPieceKg * costPerKg;
  }, [geometry, draft.remnantId, product]);

  const canMatch = geometry !== null && !!product;

  return (
    <FormDrawer
      isOpen={isOpen}
      onClose={onClose}
      width="max-w-3xl"
      title={initial ? "Editar item do orçamento" : "Adicionar item ao orçamento"}
      subtitle="Cálculo determinístico de peso, perda de corte e tempo de máquina"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {initial ? "Salvar item" : "Adicionar item"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel>Produto metálico</FieldLabel>
          <SelectMenu
            value={draft.productId}
            onChange={handleProductChange}
            options={productOptions}
            placeholder="Selecione o produto do catálogo"
            aria-label="Produto metálico"
          />
          {product && (
            <p className="mt-1 font-label-code text-label-code text-titanium-muted">
              {product.norm} · densidade {formatNumberBR(density, 2)} g/cm³ · reposição{" "}
              {formatCurrencyBRL(product.replacementCostPerKg)}/kg
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Geometria</FieldLabel>
          <SelectMenu
            value={draft.geometryType}
            onChange={(value) =>
              patch({
                geometryType: value as BuilderItem["geometryType"],
                remnantId: null,
                remnantCode: null,
              })
            }
            options={GEOMETRY_OPTIONS}
            aria-label="Tipo de geometria"
          />
        </div>

        <div>
          <FieldLabel>Quantidade de peças</FieldLabel>
          <Input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(event) => patch({ quantity: Math.max(1, Number(event.target.value) || 1) })}
          />
        </div>

        {draft.geometryType === "CHAPA_RETANGULAR" && (
          <>
            <NumberField
              label="Comprimento (mm)"
              value={draft.lengthMm}
              onChange={(value) => patch({ lengthMm: value })}
            />
            <NumberField
              label="Largura (mm)"
              value={draft.widthMm}
              onChange={(value) => patch({ widthMm: value })}
            />
            <NumberField
              label="Espessura (mm)"
              value={draft.thicknessMm}
              onChange={(value) => patch({ thicknessMm: value })}
            />
          </>
        )}

        {draft.geometryType === "DISCO" && (
          <>
            <NumberField
              label="Diâmetro externo (mm)"
              value={draft.diameterMm}
              onChange={(value) => patch({ diameterMm: value })}
            />
            <NumberField
              label="Diâmetro do furo (mm)"
              value={draft.innerDiameterMm}
              onChange={(value) => patch({ innerDiameterMm: value })}
            />
            <NumberField
              label="Espessura (mm)"
              value={draft.thicknessMm}
              onChange={(value) => patch({ thicknessMm: value })}
            />
          </>
        )}

        {draft.geometryType === "BARRA_CORTE" && (
          <>
            <NumberField
              label="Diâmetro (mm)"
              value={draft.diameterMm}
              onChange={(value) => patch({ diameterMm: value })}
            />
            <NumberField
              label="Comprimento de corte (mm)"
              value={draft.lengthMm}
              onChange={(value) => patch({ lengthMm: value })}
            />
          </>
        )}

        {draft.geometryType === "TUBO_CORTE" && (
          <>
            <NumberField
              label="Diâmetro externo (mm)"
              value={draft.diameterMm}
              onChange={(value) => patch({ diameterMm: value })}
            />
            <NumberField
              label="Parede (mm)"
              value={draft.wallMm}
              onChange={(value) => patch({ wallMm: value })}
            />
            <NumberField
              label="Comprimento de corte (mm)"
              value={draft.lengthMm}
              onChange={(value) => patch({ lengthMm: value })}
            />
          </>
        )}

        {draft.geometryType === "PADRAO" && (
          <div className="sm:col-span-2 rounded border border-carbon-700 bg-carbon-950 p-2.5 font-label-code text-label-code text-titanium-light">
            Produto de catálogo: peso tabelado de{" "}
            <strong className="text-ice-white">
              {formatNumberBR(product?.weightPerUnit ?? 0, 3)} kg
            </strong>{" "}
            por unidade.
          </div>
        )}

        <div>
          <FieldLabel>Processo de corte</FieldLabel>
          <SelectMenu
            value={draft.processType}
            onChange={(value) => handleProcessChange(value as BuilderItem["processType"])}
            options={PROCESS_OPTIONS}
            aria-label="Processo de corte"
          />
        </div>

        <div>
          <FieldLabel>Máquina</FieldLabel>
          <SelectMenu
            value={draft.machineId}
            onChange={handleMachineChange}
            options={machineOptions}
            aria-label="Máquina"
          />
        </div>

        <NumberField
          label="Setup (min)"
          value={draft.setupMinutes}
          onChange={(value) => patch({ setupMinutes: value })}
          hint="Vazio usa o setup padrão da máquina"
        />

        <NumberField
          label="Preço unitário manual (R$)"
          value={draft.manualUnitPrice}
          onChange={(value) => patch({ manualUnitPrice: value })}
          hint="Opcional: substitui o preço sugerido"
          currency
        />
      </div>

      {/* LIVE PREVIEW */}
      <div className="rounded border border-carbon-700/80 bg-carbon-950">
        <div className="flex items-center justify-between border-b border-carbon-700/60 px-3 py-2">
          <span className="flex items-center gap-1.5 font-label-caps text-label-caps uppercase text-titanium-muted">
            <Calculator className="h-3.5 w-3.5 text-tertiary" /> Prévia determinística
          </span>
          <span className="font-label-code text-label-code text-titanium-muted">
            kerf {KERF_MM[draft.processType].toFixed(1)} mm
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <Metric
            icon={<Weight className="h-3.5 w-3.5" />}
            label="Peso líquido"
            value={geometry ? `${formatNumberBR(geometry.netWeightKg, 3)} kg` : "—"}
          />
          <Metric
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Peso bruto"
            value={geometry ? `${formatNumberBR(geometry.grossWeightKg, 3)} kg` : "—"}
          />
          <Metric
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Perda de corte"
            value={geometry ? `${formatNumberBR(geometry.scrapPct, 2)}%` : "—"}
            tone={geometry && geometry.scrapPct > 12 ? "risk" : undefined}
          />
          <Metric
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Tempo de máquina"
            value={cut ? `${formatNumberBR(cut.totalMinutes, 1)} min` : "—"}
          />
        </div>
        {geometry && (
          <div className="border-t border-carbon-700/60 px-3 py-2 font-label-code text-label-code text-titanium-muted">
            <span className="text-titanium-light">{geometry.dimensionsLabel}</span>
            {" · "}
            material estimado {formatCurrencyBRL(unitMaterialCost)}/peça
            {machine
              ? ` · processo ${formatCurrencyBRL(processCost / geometry.quantity)}/peça`
              : ""}
          </div>
        )}
      </div>

      {/* REMNANT MATCHING */}
      <div className="rounded border border-carbon-700/80 bg-carbon-950">
        <div className="flex items-center justify-between border-b border-carbon-700/60 px-3 py-2">
          <span className="flex items-center gap-1.5 font-label-caps text-label-caps uppercase text-titanium-muted">
            <Boxes className="h-3.5 w-3.5 text-signal-buy" /> Matching de retalhos
          </span>
          {draft.remnantId ? (
            <button
              type="button"
              onClick={() => patch({ remnantId: null, remnantCode: null })}
              className="font-label-code text-label-code text-carmine-signal hover:underline"
            >
              Remover {draft.remnantCode}
            </button>
          ) : (
            <span className="font-label-code text-label-code text-titanium-muted">
              {loadingMatches ? "Buscando…" : `${matches.length} compatível(is)`}
            </span>
          )}
        </div>

        {!canMatch ? (
          <p className="px-3 py-3 font-label-code text-label-code text-titanium-muted">
            Informe as dimensões para procurar retalhos no estoque.
          </p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-3 font-label-code text-label-code text-titanium-muted">
            {loadingMatches
              ? "Consultando estoque de retalhos…"
              : "Nenhum retalho compatível. O item será precificado como chapa virgem."}
          </p>
        ) : (
          <ul className="divide-y divide-carbon-800">
            {matches.map((match) => {
              const selected = draft.remnantId === match.remnant.id;
              return (
                <li
                  key={match.remnant.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-label-code text-label-code">
                      <span className={selected ? "font-bold text-signal-buy" : "text-ice-white"}>
                        {match.remnant.code}
                      </span>
                      <span className="text-titanium-muted">
                        {formatNumberBR(match.remnant.thicknessMm, 2)} mm
                        {match.remnant.widthMm
                          ? ` · ${formatNumberBR(match.remnant.widthMm, 0)} × ${formatNumberBR(
                              match.remnant.lengthMm ?? 0,
                              0
                            )} mm`
                          : match.remnant.diameterMm
                            ? ` · Ø ${formatNumberBR(match.remnant.diameterMm, 0)} mm`
                            : ""}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-titanium-muted">
                      {formatNumberBR(match.remnant.weightKg, 3)} kg · {match.remnant.warehouseName}{" "}
                      · {match.remnant.locationAddress ?? "sem endereço"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-label-code text-label-code text-tertiary">
                      {formatNumberBR(match.mechanicalEfficiencyPct, 1)}% aprov.
                    </span>
                    <Button
                      size="sm"
                      variant={selected ? "primary" : "secondary"}
                      onClick={() =>
                        patch({ remnantId: match.remnant.id, remnantCode: match.remnant.code })
                      }
                    >
                      {selected ? (
                        <>
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Selecionado
                        </>
                      ) : (
                        "Usar"
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FormDrawer>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-label-caps text-label-caps uppercase text-titanium-muted">
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  currency,
}: {
  label: string;
  value: number | "";
  onChange: (value: number | "") => void;
  hint?: string;
  currency?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {currency ? (
        <CurrencyInput
          value={value === "" ? null : value}
          onValueChange={(next) => onChange(next)}
          placeholder="0,00"
          aria-label="Preço unitário manual em reais"
        />
      ) : (
        <Input
          type="number"
          step="0.01"
          min={0}
          value={value}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? "" : Number(raw));
          }}
        />
      )}
      {hint && <p className="mt-1 text-[10px] text-titanium-muted">{hint}</p>}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "risk";
}) {
  return (
    <div className="rounded border border-carbon-800 bg-carbon-900 px-2.5 py-2">
      <span className="flex items-center gap-1 font-label-caps text-label-caps uppercase text-titanium-muted">
        {icon}
        {label}
      </span>
      <p
        className={`mt-1 font-metric-regular text-metric-regular font-semibold ${
          tone === "risk" ? "text-carmine-signal" : "text-ice-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
