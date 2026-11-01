"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { SupplierDrawer } from "./supplier-drawer";
import { toggleSupplierStatus } from "./actions";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Truck,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  CheckCircle2,
} from "lucide-react";

export interface SuppliersClientProps {
  initialSuppliers: any[];
}

export function SuppliersClient({ initialSuppliers }: SuppliersClientProps) {
  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("todos");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] = React.useState<any | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [targetSupplier, setTargetSupplier] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  const filtered = React.useMemo(() => {
    return suppliers.filter((s) => {
      const matchSearch =
        search === "" ||
        s.legalName.toLowerCase().includes(search.toLowerCase()) ||
        (s.tradeName && s.tradeName.toLowerCase().includes(search.toLowerCase())) ||
        s.cnpj.includes(search);

      const matchType = typeFilter === "todos" || s.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [suppliers, search, typeFilter]);

  const totalCount = suppliers.length;
  const usinasCount = suppliers.filter((s) => s.type === "usina").length;

  function handleNew() {
    setSelectedSupplier(null);
    setDrawerOpen(true);
  }

  function handleEdit(sup: any) {
    setSelectedSupplier(sup);
    setDrawerOpen(true);
  }

  function handleToggleClick(sup: any) {
    setTargetSupplier(sup);
    setDialogOpen(true);
  }

  async function handleConfirmToggle() {
    if (!targetSupplier) return;
    setProcessing(true);
    try {
      await toggleSupplierStatus(targetSupplier.id, targetSupplier.active);
      toast.success(
        `Fornecedor ${targetSupplier.tradeName || targetSupplier.legalName} ${
          targetSupplier.active ? "desativado" : "reativado"
        } com sucesso.`
      );
      setDialogOpen(false);
      setTargetSupplier(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status do fornecedor.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Cadastros Estratégicos" },
          { label: "Fornecedores & Usinas Siderúrgicas" },
        ]}
      />

      {/* 2. Page Header */}
      <PageHeader
        title="Gestão de Fornecedores, Usinas & Traders Siderúrgicos (RF-02)"
        badge={
          <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-signal-buy px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> HOMOLOGAÇÃO ATIVA
          </span>
        }
        actions={
          <Button variant="primary" size="sm" onClick={handleNew}>
            <Plus className="w-3.5 h-3.5 mr-1 text-white" />
            + Novo Fornecedor
          </Button>
        }
      />

      {/* 3. Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Total Parceiros Cadastrados
            </span>
            <Truck className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {totalCount}
            </span>
            <span className="font-mono text-label-code text-signal-buy">
              Homologados
            </span>
          </div>
        </div>

        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Usinas Primárias (Cotação Direta)
            </span>
            <CheckCircle2 className="w-4 h-4 text-signal-buy" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {usinasCount}
            </span>
            <span className="text-headline-sm font-semibold text-titanium-muted">
              Usinas
            </span>
          </div>
        </div>

        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Lead Time Médio Siderúrgico
            </span>
            <Clock className="w-4 h-4 text-signal-hold" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-signal-hold">
              21
            </span>
            <span className="text-headline-sm font-semibold text-titanium-muted">
              dias corridos
            </span>
          </div>
        </div>
      </div>

      {/* 4. Filters */}
      <div className="bg-carbon-900 border border-carbon-800 p-3 rounded flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-titanium-dark" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Razão Social, Nome Fantasia ou CNPJ..."
            className="w-full bg-carbon-950 text-body-sm pl-9 pr-3 py-1.5 rounded border border-carbon-700 text-ice-white placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
          />
        </div>

        <div className="w-48">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-body-sm py-1"
          >
            <option value="todos">Tipo: Todos</option>
            <option value="usina">Usina</option>
            <option value="distribuidor">Distribuidor</option>
            <option value="trader">Trader</option>
          </Select>
        </div>
      </div>

      {/* 5. Table */}
      <div className="bg-carbon-900 border border-carbon-800 rounded overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-950 border-b border-carbon-800 text-label-caps font-semibold text-titanium-muted tracking-wider uppercase select-none">
                <th className="py-2.5 px-3">RAZÃO SOCIAL / FANTASIA</th>
                <th className="py-2.5 px-3 w-44">CNPJ</th>
                <th className="py-2.5 px-3 w-36">TIPO</th>
                <th className="py-2.5 px-3 w-36">CIDADE / UF</th>
                <th className="py-2.5 px-3 w-32 text-center">LEAD TIME</th>
                <th className="py-2.5 px-3 w-32">CONDIÇÃO PGTO</th>
                <th className="py-2.5 px-3 w-28 text-center">STATUS</th>
                <th className="py-2.5 px-3 w-24 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      title="Nenhum fornecedor encontrado"
                      description="Não há registros com os filtros atuais."
                      actionLabel="+ Cadastrar Fornecedor"
                      onAction={handleNew}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((s, idx) => (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      idx % 2 === 0
                        ? "bg-carbon-900/50 hover:bg-carbon-800/40"
                        : "bg-carbon-950/40 hover:bg-carbon-800/40"
                    }`}
                  >
                    <td className="py-3 px-3 align-top">
                      <div className="flex flex-col">
                        <span className="text-body-sm font-semibold text-ice-white">
                          {s.tradeName || s.legalName}
                        </span>
                        <span className="text-body-sm text-titanium-muted">
                          {s.legalName}
                        </span>
                        {s.contacts?.contactName && (
                          <span className="font-mono text-label-code text-titanium-dark mt-0.5">
                            Contato: {s.contacts.contactName} ({s.contacts.email || s.contacts.phone || "s/ tel"})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top font-mono text-body-sm text-titanium-light">
                      {s.cnpj}
                    </td>

                    <td className="py-3 px-3 align-top">
                      <span className="font-mono text-label-code bg-carbon-950 px-2 py-0.5 rounded border border-carbon-800 text-titanium-light uppercase">
                        {s.type}
                      </span>
                    </td>

                    <td className="py-3 px-3 align-top text-body-sm text-titanium-muted">
                      {s.city ? `${s.city} / ${s.uf}` : "-"}
                    </td>

                    <td className="py-3 px-3 align-top text-center font-mono text-body-sm text-signal-hold">
                      {s.leadTimeDays}d
                    </td>

                    <td className="py-3 px-3 align-top text-body-sm text-titanium-light">
                      {s.paymentTerms || "-"}
                    </td>

                    <td className="py-3 px-3 align-top text-center">
                      <StatusBadge status={s.active ? "ativo" : "inativo"} />
                    </td>

                    <td className="py-3 px-3 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(s)}
                          title="Editar fornecedor"
                          className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleClick(s)}
                          title={s.active ? "Desativar parceiro" : "Reativar parceiro"}
                          className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-signal-risk transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SupplierDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        supplier={selectedSupplier}
      />

      <ConfirmDialog
        isOpen={dialogOpen}
        title={targetSupplier?.active ? "Desativar Fornecedor" : "Reativar Fornecedor"}
        description={`Tem certeza que deseja ${
          targetSupplier?.active ? "desativar" : "reativar"
        } o parceiro ${targetSupplier?.tradeName || targetSupplier?.legalName}?`}
        confirmLabel={targetSupplier?.active ? "Desativar" : "Reativar"}
        cancelLabel="Cancelar"
        variant={targetSupplier?.active ? "danger" : "primary"}
        loading={processing}
        onCancel={() => setDialogOpen(false)}
        onConfirm={handleConfirmToggle}
      />
    </div>
  );
}
