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
import { Plus, Search, Truck, Edit2, Trash2, Clock, MapPin, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  LEAD_TIME_SOURCE_LABEL,
  type ProductSupplierTermDto,
  type LeadTimeSource,
  type ProductUnit,
  type SupplierDeliveryEventDto,
} from "@/lib/suppliers/types";

export interface SuppliersClientProps {
  initialSuppliers: any[];
  initialTerms: ProductSupplierTermDto[];
  products: { id: string; sku: string; description: string; unit: ProductUnit }[];
  supplierOptions: { id: string; name: string | null; legalName: string; active: boolean }[];
  leadTimes: Record<string, { days: number | null; source: LeadTimeSource }>;
  canConfigureTerms: boolean;
  canManageRegistry: boolean;
}

function emptyTermDraft() {
  return {
    productId: "",
    supplierId: "",
    preferred: false,
    leadTimeDays: "",
    minimumOrderQty: "",
    validFrom: new Date().toISOString().slice(0, 10),
  };
}

export function SuppliersClient({
  initialSuppliers,
  initialTerms,
  products,
  supplierOptions,
  leadTimes,
  canConfigureTerms,
  canManageRegistry,
}: SuppliersClientProps) {
  const router = useRouter();
  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("todos");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedSupplier, setSelectedSupplier] = React.useState<any | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [targetSupplier, setTargetSupplier] = React.useState<any | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [terms, setTerms] = React.useState(initialTerms);
  const [selectedSupplierForPerformance, setSelectedSupplierForPerformance] = React.useState("");
  const [performance, setPerformance] = React.useState<any>(null);
  const [editingTermId, setEditingTermId] = React.useState<string | null>(null);
  const [termDraft, setTermDraft] = React.useState(emptyTermDraft);
  const [correctionTarget, setCorrectionTarget] = React.useState<SupplierDeliveryEventDto | null>(
    null
  );
  const [correctionDraft, setCorrectionDraft] = React.useState({
    eventAt: "",
    promisedAt: "",
    itemId: "",
    quantity: "",
    reason: "",
  });
  const [savingCorrection, setSavingCorrection] = React.useState(false);

  React.useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  React.useEffect(() => setTerms(initialTerms), [initialTerms]);

  async function saveTerm(event: React.FormEvent) {
    event.preventDefault();
    const product = products.find((item) => item.id === termDraft.productId);
    if (!product || !termDraft.supplierId) return;
    const body = {
      productId: product.id,
      supplierId: termDraft.supplierId,
      preferred: termDraft.preferred,
      leadTimeDays: termDraft.leadTimeDays ? Number(termDraft.leadTimeDays) : null,
      minimumOrderQty: termDraft.minimumOrderQty ? Number(termDraft.minimumOrderQty) : null,
      unit: termDraft.minimumOrderQty ? product.unit : null,
      validFrom: new Date(`${termDraft.validFrom}T00:00:00.000Z`).toISOString(),
    };
    const termId = editingTermId;
    try {
      const response = await fetch("/api/product-supplier-terms", {
        method: termId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(termId ? { ...body, termId } : body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao salvar condição.");
      setTerms((current) => [
        ...current.map((term) =>
          term.id === termId ? { ...term, validUntil: result.data.validFrom } : term
        ),
        result.data,
      ]);
      setEditingTermId(null);
      setTermDraft(emptyTermDraft());
      toast.success(termId ? "Nova versão registrada." : "Condição por produto salva.");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar condição.");
    }
  }

  function startTermRevision(term: ProductSupplierTermDto) {
    const validFrom = new Date();
    validFrom.setUTCHours(0, 0, 0, 0);
    const currentStart = new Date(term.validFrom);
    if (validFrom <= currentStart) validFrom.setTime(currentStart.getTime() + 24 * 60 * 60 * 1000);
    setEditingTermId(term.id);
    setTermDraft({
      productId: term.productId,
      supplierId: term.supplierId,
      preferred: term.preferred,
      leadTimeDays: term.leadTimeDays === null ? "" : String(term.leadTimeDays),
      minimumOrderQty: term.minimumOrderQty === null ? "" : String(term.minimumOrderQty),
      validFrom: validFrom.toISOString().slice(0, 10),
    });
  }

  function cancelTermRevision() {
    setEditingTermId(null);
    setTermDraft(emptyTermDraft());
  }

  async function loadPerformance(supplierId: string) {
    setSelectedSupplierForPerformance(supplierId);
    setPerformance(null);
    if (!supplierId) return;
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/performance`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao consultar desempenho.");
      setPerformance(result.data);
    } catch (error: any) {
      toast.error(error.message || "Erro ao consultar desempenho.");
    }
  }

  function startEventCorrection(event: SupplierDeliveryEventDto) {
    const localDateTime = (value: string) => {
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    };
    setCorrectionTarget(event);
    setCorrectionDraft({
      eventAt: localDateTime(event.eventAt),
      promisedAt: event.promisedAt ? localDateTime(event.promisedAt) : "",
      itemId: event.itemId ?? "",
      quantity: event.quantity === null ? "" : String(event.quantity),
      reason: "",
    });
  }

  async function saveEventCorrection(delivery: any, event: React.FormEvent) {
    event.preventDefault();
    if (!correctionTarget) return;
    setSavingCorrection(true);
    try {
      const promiseEvent = ["promise_confirmed", "promise_revised"].includes(
        correctionTarget.eventType
      );
      const receiptEvent = ["received", "receipt_reversed"].includes(correctionTarget.eventType);
      const response = await fetch(
        `/api/supplier-delivery-events/${correctionTarget.id}/corrections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseOrderId: delivery.purchaseOrderId,
            eventAt: new Date(correctionDraft.eventAt).toISOString(),
            promisedAt:
              promiseEvent && correctionDraft.promisedAt
                ? new Date(correctionDraft.promisedAt).toISOString()
                : null,
            itemId: receiptEvent ? correctionDraft.itemId : null,
            quantity: receiptEvent ? Number(correctionDraft.quantity) : null,
            reason: correctionDraft.reason,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao corrigir evento.");
      setCorrectionTarget(null);
      toast.success("Correção registrada no histórico.");
      await loadPerformance(selectedSupplierForPerformance);
    } catch (error: any) {
      toast.error(error.message || "Erro ao corrigir evento.");
    } finally {
      setSavingCorrection(false);
    }
  }

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
          canManageRegistry ? (
            <Button variant="primary" size="sm" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5 mr-1 text-white" />+ Novo Fornecedor
            </Button>
          ) : null
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
            <span className="font-mono text-label-code text-signal-buy">Homologados</span>
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
            <span className="text-headline-sm font-semibold text-titanium-muted">Usinas</span>
          </div>
        </div>

        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Lead Time Médio Configurado por Produto
            </span>
            <Clock className="w-4 h-4 text-signal-hold" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-signal-hold">
              {Object.values(leadTimes).filter((value) => value.days !== null).length > 0
                ? Math.round(
                    Object.values(leadTimes).reduce(
                      (total, value) => total + (value.days ?? 0),
                      0
                    ) / Object.values(leadTimes).filter((value) => value.days !== null).length
                  )
                : "—"}
            </span>
            <span className="text-headline-sm font-semibold text-titanium-muted">
              dias · valores resolvidos, origem visível na matriz
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
                {canManageRegistry && <th className="py-2.5 px-3 w-24 text-right">AÇÕES</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManageRegistry ? 8 : 7} className="p-0">
                    <EmptyState
                      title="Nenhum fornecedor encontrado"
                      description="Não há registros com os filtros atuais."
                      actionLabel={canManageRegistry ? "+ Cadastrar Fornecedor" : undefined}
                      onAction={canManageRegistry ? handleNew : undefined}
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
                        <span className="text-body-sm text-titanium-muted">{s.legalName}</span>
                        {s.contacts?.contactName && (
                          <span className="font-mono text-label-code text-titanium-dark mt-0.5">
                            Contato: {s.contacts.contactName} (
                            {s.contacts.email || s.contacts.phone || "s/ tel"})
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
                      <span className="block text-[10px] text-titanium-dark">
                        Cadastro geral M0
                      </span>
                    </td>

                    <td className="py-3 px-3 align-top text-body-sm text-titanium-light">
                      {s.paymentTerms || "-"}
                    </td>

                    <td className="py-3 px-3 align-top text-center">
                      <StatusBadge status={s.active ? "ativo" : "inativo"} />
                    </td>

                    {canManageRegistry && (
                      <td className="py-3 px-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManageRegistry && (
                            <button
                              onClick={() => handleEdit(s)}
                              title="Editar fornecedor"
                              className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canManageRegistry && (
                            <button
                              onClick={() => handleToggleClick(s)}
                              title={s.active ? "Desativar parceiro" : "Reativar parceiro"}
                              className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-signal-risk transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-3">
        <div>
          <h2 className="text-headline-md font-semibold text-ice-white">Condições por produto</h2>
          <p className="text-body-sm text-titanium-muted">
            Preferência e lead time versionados. Cadastro geral permanece intacto.
          </p>
        </div>
        {canConfigureTerms && (
          <form onSubmit={saveTerm} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            {editingTermId && (
              <p className="md:col-span-6 text-body-sm text-titanium-muted">
                Revisão de condição: a versão vigente será encerrada no início da nova vigência e
                permanecerá no histórico.
              </p>
            )}
            <label className="text-label-caps text-titanium-muted md:col-span-2">
              Produto
              <select
                required
                disabled={Boolean(editingTermId)}
                value={termDraft.productId}
                onChange={(event) => setTermDraft({ ...termDraft, productId: event.target.value })}
                className="mt-1 w-full bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
              >
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-label-caps text-titanium-muted md:col-span-2">
              Fornecedor
              <select
                required
                value={termDraft.supplierId}
                onChange={(event) => setTermDraft({ ...termDraft, supplierId: event.target.value })}
                className="mt-1 w-full bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
              >
                <option value="">Selecione</option>
                {supplierOptions
                  .filter((supplier) => supplier.active)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name || supplier.legalName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-label-caps text-titanium-muted">
              Lead time (dias)
              <input
                type="number"
                min="1"
                value={termDraft.leadTimeDays}
                onChange={(event) =>
                  setTermDraft({ ...termDraft, leadTimeDays: event.target.value })
                }
                className="mt-1 w-full bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
              />
            </label>
            <label className="text-label-caps text-titanium-muted">
              Lote mínimo
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={termDraft.minimumOrderQty}
                onChange={(event) =>
                  setTermDraft({ ...termDraft, minimumOrderQty: event.target.value })
                }
                className="mt-1 w-full bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
              />
            </label>
            <label className="text-label-caps text-titanium-muted">
              Início da vigência
              <input
                type="date"
                required
                value={termDraft.validFrom}
                onChange={(event) => setTermDraft({ ...termDraft, validFrom: event.target.value })}
                className="mt-1 w-full bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
              />
            </label>
            <label className="flex items-center gap-2 text-body-sm text-titanium-light md:col-span-2">
              <input
                type="checkbox"
                checked={termDraft.preferred}
                onChange={(event) =>
                  setTermDraft({ ...termDraft, preferred: event.target.checked })
                }
              />{" "}
              Fornecedor preferencial no período
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                {editingTermId ? "Registrar nova versão" : "Salvar condição"}
              </Button>
              {editingTermId && (
                <Button type="button" variant="ghost" size="sm" onClick={cancelTermRevision}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="text-label-caps text-titanium-muted">
              <tr>
                <th className="py-2">Produto</th>
                <th>Fornecedor</th>
                <th>Preferência</th>
                <th>Lead time</th>
                <th>Lote mínimo</th>
                <th>Vigência</th>
                <th>Autor</th>
                {canConfigureTerms && <th>Ação</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-800/60">
              {terms.map((term) => (
                <tr key={term.id} className="text-titanium-light">
                  <td className="py-2">
                    {term.sku} · {term.productDescription}
                  </td>
                  <td>{term.supplierName}</td>
                  <td>{term.preferred ? "Preferencial" : "Alternativo"}</td>
                  <td>
                    {term.leadTimeDays === null ? "Não definido" : `${term.leadTimeDays} dias`}
                  </td>
                  <td>
                    {term.minimumOrderQty === null
                      ? "Não definido"
                      : `${term.minimumOrderQty} ${term.unit}`}
                  </td>
                  <td>
                    {new Date(term.validFrom).toLocaleDateString("pt-BR")} –{" "}
                    {term.validUntil
                      ? new Date(term.validUntil).toLocaleDateString("pt-BR")
                      : "em aberto"}
                  </td>
                  <td>{term.changedByName || "—"}</td>
                  {canConfigureTerms && (
                    <td>
                      {!term.validUntil && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => startTermRevision(term)}
                          aria-label={`Revisar condição de ${term.supplierName} para ${term.sku}`}
                        >
                          <Edit2 className="mr-1 h-3.5 w-3.5" /> Nova versão
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {terms.length === 0 && (
            <p className="py-4 text-body-sm text-titanium-muted">Nenhuma condição registrada.</p>
          )}
        </div>
      </section>

      <section className="bg-carbon-900 border border-carbon-800 rounded p-4 space-y-3">
        <h2 className="text-headline-md font-semibold text-ice-white">Desempenho de entregas</h2>
        <label className="text-label-caps text-titanium-muted">
          Fornecedor
          <select
            value={selectedSupplierForPerformance}
            onChange={(event) => loadPerformance(event.target.value)}
            className="mt-1 block w-full max-w-lg bg-carbon-950 border border-carbon-700 rounded px-2 py-2 text-body-sm text-ice-white"
          >
            <option value="">Selecione para consultar últimos 90 dias</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name || supplier.legalName}
              </option>
            ))}
          </select>
        </label>
        {performance && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-body-sm">
            <div>
              <span className="block text-titanium-muted">OTIF</span>
              <strong className="text-ice-white">
                {performance.otifPct === null ? "Sem dados" : `${performance.otifPct}%`}
              </strong>
            </div>
            <div>
              <span className="block text-titanium-muted">Amostra elegível</span>
              <strong className="text-ice-white">{performance.eligibleCount}</strong>
            </div>
            <div>
              <span className="block text-titanium-muted">Completas no prazo</span>
              <strong className="text-ice-white">{performance.otifCount}</strong>
            </div>
            <div>
              <span className="block text-titanium-muted">Atrasadas</span>
              <strong className="text-ice-white">{performance.lateCount}</strong>
            </div>
            <div>
              <span className="block text-titanium-muted">Incompletas</span>
              <strong className="text-ice-white">{performance.incompleteCount}</strong>
            </div>
            <div className="col-span-2 md:col-span-5 text-titanium-muted">
              Sem promessa: {performance.excluded.noPromise} · Canceladas antes da promessa:{" "}
              {performance.excluded.cancelledBeforePromise} · Em andamento:{" "}
              {performance.excluded.inProgress} · Lead time observado:{" "}
              {performance.observedLeadTimeDays === null
                ? "sem dados"
                : `${performance.observedLeadTimeDays} dias`}
            </div>
            <div className="col-span-2 md:col-span-5 space-y-1">
              <span className="block text-titanium-muted">Entregas no período</span>
              {performance.deliveries.length === 0 ? (
                <p className="rounded border border-carbon-800 bg-carbon-950/60 px-3 py-3 text-titanium-light">
                  Nenhum pedido com histórico de entrega nos últimos 90 dias. Para gerar dados,
                  emita um pedido para este fornecedor e registre a promessa recebida; pedidos
                  antigos sem eventos registrados não são reconstruídos automaticamente.
                </p>
              ) : null}
              {performance.deliveries.map((delivery: any) => (
                <div
                  key={delivery.purchaseOrderId}
                  className="flex flex-wrap justify-between gap-2 border-t border-carbon-800 py-1"
                >
                  <span>
                    {delivery.numberLabel} · {delivery.situationLabel}
                  </span>
                  <span>
                    Promessa original:{" "}
                    {delivery.promisedOriginalAt
                      ? new Date(delivery.promisedOriginalAt).toLocaleDateString("pt-BR")
                      : "sem promessa"}{" "}
                    · Concluída:{" "}
                    {delivery.completedAt
                      ? new Date(delivery.completedAt).toLocaleDateString("pt-BR")
                      : "pendente"}
                  </span>
                  {delivery.revisions.map((revision: any, index: number) => (
                    <span key={index} className="w-full text-titanium-muted">
                      Reprogramada em {new Date(revision.eventAt).toLocaleDateString("pt-BR")}:{" "}
                      {revision.note || "sem justificativa"}
                    </span>
                  ))}
                  <details className="w-full border-t border-carbon-800 pt-2">
                    <summary className="cursor-pointer text-titanium-light hover:text-ice-white">
                      Histórico de eventos ({delivery.events.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {delivery.events.map((event: SupplierDeliveryEventDto) => {
                        const labels: Record<string, string> = {
                          issued: "Pedido emitido",
                          promise_confirmed: "Promessa confirmada",
                          promise_revised: "Promessa reprogramada",
                          received: "Recebimento",
                          receipt_reversed: "Estorno de recebimento",
                          cancelled: "Pedido cancelado",
                        };
                        return (
                          <div
                            key={event.id}
                            className="rounded border border-carbon-800 p-2 text-titanium-light"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {labels[event.eventType] || event.eventType} ·{" "}
                                {new Date(event.eventAt).toLocaleString("pt-BR")}
                              </span>
                              {event.corrected ? (
                                <span className="text-signal-hold">Substituído por correção</span>
                              ) : null}
                              {performance.capabilities?.includes("supplier.correct_events") &&
                                !event.corrected &&
                                !event.compensatesEventId && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startEventCorrection(event)}
                                  >
                                    Corrigir
                                  </Button>
                                )}
                            </div>
                            {event.promisedAt && (
                              <p>Promessa: {new Date(event.promisedAt).toLocaleString("pt-BR")}</p>
                            )}
                            {event.itemLabel && (
                              <p>
                                {event.itemLabel} · {event.quantity} un.
                              </p>
                            )}
                            {event.note && <p className="text-titanium-muted">{event.note}</p>}
                            {event.correctionReason && (
                              <p className="text-titanium-muted">
                                Justificativa: {event.correctionReason}
                              </p>
                            )}
                            <p className="text-xs text-titanium-muted">
                              Registrado em {new Date(event.createdAt).toLocaleString("pt-BR")}
                            </p>
                            {correctionTarget?.id === event.id && (
                              <form
                                className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2"
                                onSubmit={(formEvent) => saveEventCorrection(delivery, formEvent)}
                              >
                                <label>
                                  Data e hora do evento
                                  <input
                                    required
                                    type="datetime-local"
                                    value={correctionDraft.eventAt}
                                    onChange={(e) =>
                                      setCorrectionDraft({
                                        ...correctionDraft,
                                        eventAt: e.target.value,
                                      })
                                    }
                                    className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-2 py-2 text-ice-white"
                                  />
                                </label>
                                {["promise_confirmed", "promise_revised"].includes(
                                  event.eventType
                                ) && (
                                  <label>
                                    Data prometida
                                    <input
                                      required
                                      type="datetime-local"
                                      value={correctionDraft.promisedAt}
                                      onChange={(e) =>
                                        setCorrectionDraft({
                                          ...correctionDraft,
                                          promisedAt: e.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-2 py-2 text-ice-white"
                                    />
                                  </label>
                                )}
                                {["received", "receipt_reversed"].includes(event.eventType) && (
                                  <>
                                    <label>
                                      Item do pedido
                                      <select
                                        required
                                        value={correctionDraft.itemId}
                                        onChange={(e) =>
                                          setCorrectionDraft({
                                            ...correctionDraft,
                                            itemId: e.target.value,
                                          })
                                        }
                                        className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-2 py-2 text-ice-white"
                                      >
                                        <option value="">Selecione</option>
                                        {delivery.items.map((item: any) => (
                                          <option key={item.id} value={item.id}>
                                            {item.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Quantidade
                                      <input
                                        required
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        value={correctionDraft.quantity}
                                        onChange={(e) =>
                                          setCorrectionDraft({
                                            ...correctionDraft,
                                            quantity: e.target.value,
                                          })
                                        }
                                        className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-2 py-2 text-ice-white"
                                      />
                                    </label>
                                  </>
                                )}
                                <label className="md:col-span-2">
                                  Justificativa (mínimo 10 caracteres)
                                  <textarea
                                    required
                                    minLength={10}
                                    value={correctionDraft.reason}
                                    onChange={(e) =>
                                      setCorrectionDraft({
                                        ...correctionDraft,
                                        reason: e.target.value,
                                      })
                                    }
                                    className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-2 py-2 text-ice-white"
                                  />
                                </label>
                                <div className="flex gap-2 md:col-span-2">
                                  <Button type="submit" size="sm" disabled={savingCorrection}>
                                    {savingCorrection ? "Registrando…" : "Registrar correção"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setCorrectionTarget(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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
