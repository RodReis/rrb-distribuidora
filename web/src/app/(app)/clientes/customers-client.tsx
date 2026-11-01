"use client";

import * as React from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerDrawer } from "./customer-drawer";
import { toggleCustomerStatus } from "./actions";
import { toast } from "sonner";
import { Plus, Search, Users, Edit2, Trash2, Building, ShieldCheck } from "lucide-react";

export interface CustomersClientProps {
  initialCustomers: any[];
}

export function CustomersClient({ initialCustomers }: CustomersClientProps) {
  const [customers, setCustomers] = React.useState(initialCustomers);
  const [search, setSearch] = React.useState("");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedCustomer, setSelectedCustomer] = React.useState<any | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [targetCustomer, setTargetCustomer] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    setCustomers(initialCustomers);
  }, [initialCustomers]);

  const filtered = React.useMemo(() => {
    return customers.filter((c) => {
      const matchSearch =
        search === "" ||
        c.legalName.toLowerCase().includes(search.toLowerCase()) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(search.toLowerCase())) ||
        c.document.includes(search) ||
        (c.segment && c.segment.toLowerCase().includes(search.toLowerCase()));

      return matchSearch;
    });
  }, [customers, search]);

  const totalCount = customers.length;
  const activeCount = customers.filter((c) => c.active).length;

  function handleNew() {
    setSelectedCustomer(null);
    setDrawerOpen(true);
  }

  function handleEdit(item: any) {
    setSelectedCustomer(item);
    setDrawerOpen(true);
  }

  function handleToggleClick(item: any) {
    setTargetCustomer(item);
    setDialogOpen(true);
  }

  async function handleConfirmToggle() {
    if (!targetCustomer) return;
    setProcessing(true);
    try {
      await toggleCustomerStatus(targetCustomer.id, targetCustomer.active);
      toast.success(
        `Cliente ${targetCustomer.tradeName || targetCustomer.legalName} ${
          targetCustomer.active ? "desativado" : "reativado"
        } com sucesso.`
      );
      setDialogOpen(false);
      setTargetCustomer(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar cliente.");
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
          { label: "Clientes & Indústrias Consumidoras" },
        ]}
      />

      {/* 2. Page Header */}
      <PageHeader
        title="Carteira de Clientes & Indústrias Metalúrgicas (RF-03)"
        badge={
          <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-signal-buy px-2 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> CARTEIRA ATIVA
          </span>
        }
        actions={
          <Button variant="primary" size="sm" onClick={handleNew}>
            <Plus className="w-3.5 h-3.5 mr-1 text-white" />+ Novo Cliente
          </Button>
        }
      />

      {/* 3. Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Total Clientes Registrados
            </span>
            <Users className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {totalCount}
            </span>
            <span className="font-mono text-label-code text-signal-buy">{activeCount} Ativos</span>
          </div>
        </div>

        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Segmentos Atendidos
            </span>
            <Building className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">3</span>
            <span className="text-headline-sm font-semibold text-titanium-muted">Segmentos</span>
          </div>
        </div>

        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Conformidade Cadastral SEFAZ
            </span>
            <ShieldCheck className="w-4 h-4 text-signal-buy" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-signal-buy">
              100%
            </span>
            <span className="font-mono text-label-code text-titanium-muted">Sintegra / CCC</span>
          </div>
        </div>
      </div>

      {/* 4. Search Filter Bar */}
      <div className="bg-carbon-900 border border-carbon-800 p-3 rounded">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-titanium-dark" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Razão Social, Nome Fantasia, CNPJ/CPF ou Segmento..."
            className="w-full bg-carbon-950 text-body-sm pl-9 pr-3 py-1.5 rounded border border-carbon-700 text-ice-white placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
          />
        </div>
      </div>

      {/* 5. Table */}
      <div className="bg-carbon-900 border border-carbon-800 rounded overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-carbon-950 border-b border-carbon-800 text-label-caps font-semibold text-titanium-muted tracking-wider uppercase select-none">
                <th className="py-2.5 px-3">RAZÃO SOCIAL / CLIENTE</th>
                <th className="py-2.5 px-3 w-44">CNPJ / CPF</th>
                <th className="py-2.5 px-3 w-40">SEGMENTO</th>
                <th className="py-2.5 px-3 w-36">CIDADE / UF</th>
                <th className="py-2.5 px-3 w-36">INSCRIÇÃO ESTADUAL</th>
                <th className="py-2.5 px-3 w-28 text-center">STATUS</th>
                <th className="py-2.5 px-3 w-24 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      title="Nenhum cliente encontrado"
                      description="Não há clientes cadastrados com esse critério de busca."
                      actionLabel="+ Cadastrar Cliente"
                      onAction={handleNew}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((c, idx) => (
                  <tr
                    key={c.id}
                    className={`transition-colors ${
                      idx % 2 === 0
                        ? "bg-carbon-900/50 hover:bg-carbon-800/40"
                        : "bg-carbon-950/40 hover:bg-carbon-800/40"
                    }`}
                  >
                    <td className="py-3 px-3 align-top">
                      <div className="flex flex-col">
                        <span className="text-body-sm font-semibold text-ice-white">
                          {c.tradeName || c.legalName}
                        </span>
                        <span className="text-body-sm text-titanium-muted">{c.legalName}</span>
                        {c.contacts?.contactName && (
                          <span className="font-mono text-label-code text-titanium-dark mt-0.5">
                            Contato: {c.contacts.contactName} (
                            {c.contacts.phone || c.contacts.email || "s/ tel"})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top font-mono text-body-sm text-titanium-light">
                      {c.document}
                    </td>

                    <td className="py-3 px-3 align-top text-body-sm text-titanium-light">
                      {c.segment || "-"}
                    </td>

                    <td className="py-3 px-3 align-top text-body-sm text-titanium-muted">
                      {c.city ? `${c.city} / ${c.uf}` : "-"}
                    </td>

                    <td className="py-3 px-3 align-top font-mono text-body-sm text-titanium-dark">
                      {c.stateRegistration || "ISENTO"}
                    </td>

                    <td className="py-3 px-3 align-top text-center">
                      <StatusBadge status={c.active ? "ativo" : "inativo"} />
                    </td>

                    <td className="py-3 px-3 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(c)}
                          title="Editar cliente"
                          className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleClick(c)}
                          title={c.active ? "Desativar cliente" : "Reativar cliente"}
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

      <CustomerDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        customer={selectedCustomer}
      />

      <ConfirmDialog
        isOpen={dialogOpen}
        title={targetCustomer?.active ? "Desativar Cliente" : "Reativar Cliente"}
        description={`Tem certeza que deseja ${
          targetCustomer?.active ? "desativar" : "reativar"
        } o cliente ${targetCustomer?.tradeName || targetCustomer?.legalName}?`}
        confirmLabel={targetCustomer?.active ? "Desativar" : "Reativar"}
        cancelLabel="Cancelar"
        variant={targetCustomer?.active ? "danger" : "primary"}
        loading={processing}
        onCancel={() => setDialogOpen(false)}
        onConfirm={handleConfirmToggle}
      />
    </div>
  );
}
