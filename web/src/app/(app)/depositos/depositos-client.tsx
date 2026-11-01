"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDrawer } from "@/components/shared/form-drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { saveWarehouse } from "./actions";
import { toast } from "sonner";
import { Plus, Warehouse, Edit2, MapPin } from "lucide-react";

export function DepositosClient({ initialWarehouses }: { initialWarehouses: any[] }) {
  const [items, setItems] = React.useState(initialWarehouses);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any | null>(null);

  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [type, setType] = React.useState<any>("matriz");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setItems(initialWarehouses);
  }, [initialWarehouses]);

  React.useEffect(() => {
    if (selected) {
      setName(selected.name || "");
      setAddress(selected.address || "");
      setType(selected.type || "matriz");
    } else {
      setName("");
      setAddress("");
      setType("matriz");
    }
  }, [selected, drawerOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    try {
      const res = await saveWarehouse({
        id: selected?.id,
        name,
        address,
        type,
      });
      if (res.success) {
        toast.success(`Depósito ${res.item.name} salvo com sucesso.`);
        setDrawerOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar depósito.");
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
          { label: "Depósitos & Armazéns Logísticos" },
        ]}
      />

      <PageHeader
        title="Centros de Distribuição & Pátios de Aço (RF-04)"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelected(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-white" />
            + Novo Depósito
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((w) => (
          <div
            key={w.id}
            className="bg-carbon-900 border border-carbon-800 rounded p-4 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-label-code bg-carbon-950 px-2 py-0.5 rounded border border-carbon-800 text-titanium-light uppercase">
                  {w.type}
                </span>
                <StatusBadge status={w.active ? "ativo" : "inativo"} />
              </div>
              <h3 className="text-headline-sm font-semibold text-ice-white mt-2">
                {w.name}
              </h3>
              <p className="text-body-sm text-titanium-muted mt-1 flex items-start gap-1.5">
                <MapPin className="w-4 h-4 shrink-0 text-titanium-dark mt-0.5" />
                <span>{w.address || "Endereço não informado"}</span>
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-carbon-800 flex justify-end">
              <button
                onClick={() => {
                  setSelected(w);
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
        title={selected ? `Edição — ${selected.name}` : "+ Novo Depósito / Pátio"}
        subtitle="Unidade física para endereçamento e estoque de bobinas e chapas"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Salvando..." : "Salvar Depósito"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Nome da Unidade / Depósito *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pátio Secundário - Loteamento Norte"
              required
            />
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Tipo Operacional *
            </label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="matriz">Matriz / Hub Central</option>
              <option value="filial">Filial / Centro de Serviços</option>
              <option value="patio">Pátio Externo / Alfandegado</option>
            </Select>
          </div>
          <div>
            <label className="text-label-caps font-semibold text-titanium-muted uppercase block mb-1">
              Endereço Completo
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Av. Industrial, 1200 - Mooca, São Paulo/SP"
            />
          </div>
        </form>
      </FormDrawer>
    </div>
  );
}
