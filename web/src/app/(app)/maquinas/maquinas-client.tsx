"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDrawer } from "@/components/shared/form-drawer";
import { saveMachine } from "../depositos/actions";
import { formatCurrencyBRL } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Cog, Edit2, Timer, DollarSign } from "lucide-react";

export function MaquinasClient({ initialMachines }: { initialMachines: any[] }) {
  const [items, setItems] = React.useState(initialMachines);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any | null>(null);

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<any>("laser");
  const [costPerHour, setCostPerHour] = React.useState<number | "">(350);
  const [setupMin, setSetupMin] = React.useState<number>(15);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setItems(initialMachines);
  }, [initialMachines]);

  React.useEffect(() => {
    if (selected) {
      setName(selected.name || "");
      setType(selected.type || "laser");
      setCostPerHour(selected.costPerHour ? parseFloat(selected.costPerHour) : 0);
      setSetupMin(selected.setupMin || 15);
    } else {
      setName("");
      setType("laser");
      setCostPerHour(350);
      setSetupMin(15);
    }
  }, [selected, drawerOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    try {
      const res = await saveMachine({
        id: selected?.id,
        name,
        type,
        costPerHour: Number(costPerHour) || 0,
        setupMin: Number(setupMin) || 0,
      });
      if (res.success) {
        toast.success(`Máquina ${res.item.name} salva com sucesso.`);
        setDrawerOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar máquina.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Cadastros Estratégicos" },
          { label: "Máquinas & Equipamentos de Corte" },
        ]}
      />

      <PageHeader
        title="Parque Fabril & Centros de Usinagem / Corte (RF-05)"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelected(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-white" />+ Nova Máquina
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((m) => (
          <div
            key={m.id}
            className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-code bg-carbon-950 px-2 py-0.5 rounded border border-carbon-800 text-carmine-signal uppercase">
                  {m.type}
                </span>
                <StatusBadge status={m.active ? "ativo" : "inativo"} />
              </div>
              <h3 className="text-body-md font-semibold text-ice-white mt-2">{m.name}</h3>
              <div className="mt-3 pt-2 border-t border-carbon-800/80 space-y-1 font-mono text-label-code text-titanium-muted">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-signal-buy" /> Custo Hora:
                  </span>
                  <span className="text-signal-buy font-semibold">
                    {formatCurrencyBRL(m.costPerHour)}/h
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-signal-hold" /> Setup Médio:
                  </span>
                  <span className="text-ice-white">{m.setupMin} min</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-carbon-800 flex justify-end">
              <button
                onClick={() => {
                  setSelected(m);
                  setDrawerOpen(true);
                }}
                className="text-body-sm text-titanium-muted hover:text-ice-white flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      <FormDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selected ? `Edição — ${selected.name}` : "+ Nova Máquina de Corte"}
        subtitle="Configuração de custo/hora para orçamentos e nesting no M3"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Salvando..." : "Salvar Máquina"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Nome do Equipamento *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Laser Fibra Óptica 15kW - Bodor"
              required
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Processo / Tecnologia *
            </label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="laser">Laser Fibra Óptica</option>
              <option value="plasma">Mesa de Plasma HD</option>
              <option value="guilhotina">Guilhotina Hidráulica</option>
              <option value="serra">Serra Fita / Circular</option>
              <option value="dobra">Dobradeira CNC</option>
              <option value="slitter">Linha de Slitter (Bobinas)</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
                Custo de Máquina (R$/hora) *
              </label>
              <Input
                type="number"
                step="1"
                value={costPerHour}
                onChange={(e) => setCostPerHour(parseFloat(e.target.value) || 0)}
                placeholder="350"
                required
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
                Tempo Médio de Setup (Minutos)
              </label>
              <Input
                type="number"
                min={0}
                value={setupMin}
                onChange={(e) => setSetupMin(parseInt(e.target.value) || 0)}
                placeholder="15"
                className="font-mono"
              />
            </div>
          </div>
        </form>
      </FormDrawer>
    </div>
  );
}
