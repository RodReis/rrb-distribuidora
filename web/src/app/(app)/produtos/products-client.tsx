"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductDrawer } from "./product-drawer";
import { deleteProduct } from "./actions";
import { formatCurrencyBRL } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  FileSpreadsheet,
  History,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Database,
  ShieldAlert,
} from "lucide-react";

export interface ProductsClientProps {
  initialProducts: any[];
}

export function ProductsClient({ initialProducts }: ProductsClientProps) {
  const router = useRouter();
  const [products, setProducts] = React.useState(initialProducts);
  const [search, setSearch] = React.useState("");
  const [familyFilter, setFamilyFilter] = React.useState("todas");
  const [statusFilter, setStatusFilter] = React.useState("todos");

  // Selection
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Drawer & Dialog states
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState<any | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [productToDelete, setProductToDelete] = React.useState<any | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Sync when server data refreshes
  React.useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  // Filter logic
  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        search === "" ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        (p.erpCode && p.erpCode.toLowerCase().includes(search.toLowerCase())) ||
        p.commercialDescription.toLowerCase().includes(search.toLowerCase()) ||
        p.norm.toLowerCase().includes(search.toLowerCase());

      const matchFamily = familyFilter === "todas" || p.family === familyFilter;
      const matchStatus = statusFilter === "todos" || p.status === statusFilter;

      return matchSearch && matchFamily && matchStatus;
    });
  }, [products, search, familyFilter, statusFilter]);

  // Metrics
  const totalCount = products.length;
  const activeCount = products.filter((p) => p.status === "ativo").length;
  const inactiveCount = products.filter((p) => p.status === "inativo").length;

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelectedIds(filteredProducts.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  }

  function handleSelectOne(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function handleNew() {
    setSelectedProduct(null);
    setDrawerOpen(true);
  }

  function handleEdit(product: any) {
    setSelectedProduct(product);
    setDrawerOpen(true);
  }

  function handleDeleteClick(product: any) {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!productToDelete) return;
    setDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      toast.success(`Produto ${productToDelete.sku} inativado com sucesso.`);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir produto.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "OP-CAD", href: "/produtos" },
          { label: "Módulo 01 / Cadastros & CRUD" },
          { label: "Tabela Técnica de SKUs" },
        ]}
      />

      {/* 2. Page Header */}
      <PageHeader
        title="Cadastros Estratégicos & Catálogo Técnico de Produtos Metálicos (RF-01)"
        badge={
          <div className="flex items-center gap-2">
            <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-signal-buy px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-buy" /> ERP SYNC: 0.2s
            </span>
            <span className="font-mono text-label-code bg-carbon-900 border border-carbon-700 text-titanium-muted px-2 py-0.5 rounded">
              MOTOR ASTM/ABNT V4.2
            </span>
          </div>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.info("Relatório Analítico PDF/XLSX gerado em fila.")}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-titanium-muted" />
              Gerar Relatório Analítico
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/importar")}
            >
              Importar Catálogo (CSV)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push("/admin/auditoria")}
            >
              <History className="w-3.5 h-3.5 mr-1.5 text-titanium-muted" />
              Logs de Auditoria
            </Button>
            <Button variant="primary" size="sm" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5 mr-1 text-white" />
              Novo Produto Metálico [F2]
            </Button>
          </>
        }
      />

      {/* 3. KPI Metric Tiles Grid (Mockup 1:1) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Tile 1: Total SKUs */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Total SKUs Industriais
            </span>
            <Database className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              {totalCount}
            </span>
            <span className="font-mono text-label-code text-signal-buy">
              +14 novos este mês
            </span>
          </div>
          <div className="mt-2 font-mono text-label-code text-titanium-muted">
            {activeCount} Ativos ({totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(1) : 0}%) • {inactiveCount} Inativos
          </div>
        </div>

        {/* Tile 2: Mix Famílias */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Mix de Famílias de Matéria-Prima
            </span>
            <SlidersHorizontal className="w-4 h-4 text-titanium-dark" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-ice-white">
              5
            </span>
            <span className="text-headline-sm font-semibold text-ice-white">
              Famílias
            </span>
          </div>
          <div className="mt-2 font-mono text-label-code text-titanium-muted">
            Chapas: 42% • Bobinas: 28% • Tubos/Outros: 30%
          </div>
        </div>

        {/* Tile 3: Densidade & Tolerâncias */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between text-titanium-muted">
            <span className="text-label-caps font-semibold uppercase tracking-wider">
              Densidade & Tolerâncias
            </span>
            <span className="font-mono text-label-code text-signal-buy bg-signal-buy/10 px-1.5 py-0.5 rounded border border-signal-buy/30">
              NORMAS OK
            </span>
          </div>
          <div className="mt-2">
            <span className="font-mono text-metric-display font-semibold text-signal-buy">
              99.4%
            </span>
          </div>
          <div className="mt-2 font-mono text-label-code text-titanium-muted flex justify-between">
            <span>Conformidade ABNT / ASTM</span>
            <span>{totalCount} calibrados</span>
          </div>
        </div>

        {/* Tile 4: Alerta Risco Nesting */}
        <div className="bg-carbon-900 border border-carbon-800 p-3.5 rounded flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-label-caps font-semibold uppercase tracking-wider text-carmine-signal flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-carmine-signal animate-pulse" />
              ALERTA CADASTRO & NESTING
            </span>
            <ShieldAlert className="w-4 h-4 text-carmine-signal" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-metric-display font-semibold text-carmine-signal">
              0 SKUs
            </span>
            <span className="font-mono text-label-code bg-carbon-950 px-1.5 py-0.5 rounded text-titanium-muted border border-carbon-800">
              SEM DESVIO
            </span>
          </div>
          <div className="mt-2 font-mono text-label-code text-titanium-muted flex justify-between">
            <span>Risco em cálculo de nesting</span>
            <span className="text-signal-buy">Normalizado</span>
          </div>
        </div>
      </div>

      {/* 4. Filter Toolbar & Search Bar (Mockup 1:1) */}
      <div className="bg-carbon-900 border border-carbon-800 p-3 rounded space-y-2.5">
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-titanium-dark" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Código SKU, Descrição, Norma (Ctrl + K)..."
              className="w-full bg-carbon-950 text-body-sm pl-9 pr-3 py-1.5 rounded border border-carbon-700 text-ice-white placeholder-titanium-dark focus:outline-none focus:ring-1 focus:ring-carmine-core"
            />
          </div>

          {/* Select Filters */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-44">
              <Select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="text-body-sm py-1"
              >
                <option value="todas">Família: Todas</option>
                <option value="chapa_grossa">Chapa Grossa</option>
                <option value="bobina">Bobinas</option>
                <option value="tubo">Tubos</option>
                <option value="perfil">Perfis</option>
                <option value="barra">Barras</option>
              </Select>
            </div>

            <div className="w-40">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-body-sm py-1"
              >
                <option value="todos">Status: Todos</option>
                <option value="ativo">Ativo</option>
                <option value="homologacao">Homologação</option>
                <option value="inativo">Inativo</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Tab Quick Filters & Batch Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-carbon-800/80 font-mono text-label-code">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStatusFilter("todos")}
              className={`pb-0.5 border-b-2 transition-colors cursor-pointer ${
                statusFilter === "todos"
                  ? "border-carmine-core text-ice-white font-medium"
                  : "border-transparent text-titanium-muted hover:text-ice-white"
              }`}
            >
              TODOS ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter("ativo")}
              className={`pb-0.5 border-b-2 transition-colors cursor-pointer ${
                statusFilter === "ativo"
                  ? "border-carmine-core text-ice-white font-medium"
                  : "border-transparent text-titanium-muted hover:text-ice-white"
              }`}
            >
              ATIVOS ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter("inativo")}
              className={`pb-0.5 border-b-2 transition-colors cursor-pointer ${
                statusFilter === "inativo"
                  ? "border-carmine-core text-ice-white font-medium"
                  : "border-transparent text-titanium-muted hover:text-ice-white"
              }`}
            >
              INATIVOS ({inactiveCount})
            </button>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 bg-carbon-950 px-2.5 py-1 rounded border border-carbon-800">
              <span className="text-signal-buy flex items-center gap-1 font-semibold">
                ✓ {selectedIds.length} ITENS SELECIONADOS
              </span>
              <button
                onClick={() => toast.info("Inativação em lote executada.")}
                className="text-titanium-light hover:text-signal-risk cursor-pointer"
              >
                Inativar em Lote
              </button>
              <button
                onClick={() => toast.info("Reajuste de margem em lote aberto.")}
                className="text-titanium-light hover:text-carmine-signal cursor-pointer"
              >
                Reajustar Margem Mínima
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Terminal DataTable Grid (Mockup 1:1) */}
      <div className="bg-carbon-900 border border-carbon-800 rounded overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {/* Table Header */}
            <thead>
              <tr className="bg-carbon-950 border-b border-carbon-800 font-sans text-label-caps font-semibold text-titanium-muted tracking-wider uppercase select-none">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      selectedIds.length === filteredProducts.length
                    }
                    onChange={handleSelectAll}
                    className="accent-carmine-core rounded bg-carbon-950 border-carbon-700 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 w-44">SKU / CÓD. ERP ⇅</th>
                <th className="py-2.5 px-3">DESCRIÇÃO TÉCNICA METALÚRGICA & DIMENSÕES</th>
                <th className="py-2.5 px-3 w-48">FAMÍLIA & NORMA</th>
                <th className="py-2.5 px-3 w-44 text-right">DENSIDADE / PESO TEÓRICO</th>
                <th className="py-2.5 px-3 w-40 text-right">PREÇO REPOSIÇÃO BASE</th>
                <th className="py-2.5 px-3 w-28 text-center">STATUS</th>
                <th className="py-2.5 px-3 w-24 text-right">AÇÕES</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-carbon-800/60 font-sans">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <EmptyState
                      title="Nenhum produto metálico encontrado"
                      description="Não há itens cadastrados para os filtros selecionados. Crie um novo produto ou ajuste a busca."
                      actionLabel="+ Cadastrar Primeiro Produto"
                      onAction={handleNew}
                    />
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, idx) => {
                  const isSelected = selectedIds.includes(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors group ${
                        isSelected
                          ? "bg-carbon-800/70"
                          : idx % 2 === 0
                          ? "bg-carbon-900/50 hover:bg-carbon-800/40"
                          : "bg-carbon-950/40 hover:bg-carbon-800/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 align-top">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(p.id)}
                          className="accent-carmine-core rounded bg-carbon-950 border-carbon-700 cursor-pointer mt-1"
                        />
                      </td>

                      {/* SKU / ERP */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col">
                          <span className="font-mono text-body-sm font-semibold text-carmine-signal tracking-tight">
                            {p.sku}
                          </span>
                          {p.erpCode && (
                            <span className="font-mono text-label-code text-titanium-dark mt-0.5">
                              ERP ID: {p.erpCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Descrição & Dimensões */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col">
                          <span className="text-body-sm font-medium text-ice-white leading-snug">
                            {p.commercialDescription}
                          </span>
                          <span className="font-mono text-label-code text-titanium-muted mt-1 leading-tight">
                            Fiscal: {p.fiscalDescription} • NCM: {p.ncm}
                          </span>
                        </div>
                      </td>

                      {/* Família & Norma */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col">
                          <span className="text-body-sm text-titanium-light capitalize">
                            {p.family.replace("_", " ")}
                          </span>
                          <span className="font-mono text-label-code text-titanium-muted mt-0.5">
                            {p.norm}
                          </span>
                        </div>
                      </td>

                      {/* Densidade / Peso Teórico (Monospaced right) */}
                      <td className="py-3 px-3 align-top text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span className="text-body-sm font-semibold text-ice-white">
                            {p.densityGCm3} g/cm³
                          </span>
                          <span className="text-label-code text-titanium-muted mt-0.5">
                            {p.weightPerUnit} kg / {p.unit}
                          </span>
                        </div>
                      </td>

                      {/* Preço de Reposição Base */}
                      <td className="py-3 px-3 align-top text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span className="text-body-sm font-semibold text-signal-buy">
                            {formatCurrencyBRL(p.replacementCostBase)} /{p.unit}
                          </span>
                          <span className="text-label-code text-titanium-dark mt-0.5">
                            Custo Reposição Base
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 align-top text-center">
                        <StatusBadge status={p.status} />
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(p)}
                            title="Editar especificações"
                            className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(p)}
                            title="Inativar produto"
                            className="p-1 rounded hover:bg-carbon-700 text-titanium-muted hover:text-signal-risk transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Pagination Footer (Mockup 1:1) */}
        <div className="bg-carbon-950 px-4 py-2.5 border-t border-carbon-800 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono text-label-code text-titanium-muted">
          <div>
            Exibindo <span className="text-ice-white">1 a {filteredProducts.length}</span> de{" "}
            <span className="text-ice-white">{totalCount}</span> itens cadastrados
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Itens por página:</span>
              <select className="bg-carbon-900 border border-carbon-700 rounded px-2 py-0.5 text-ice-white focus:outline-none">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled
                className="px-2 py-0.5 rounded bg-carbon-900 border border-carbon-800 text-titanium-dark cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              <button className="px-2 py-0.5 rounded bg-carmine-core text-white font-bold">
                1
              </button>
              <button
                disabled
                className="px-2 py-0.5 rounded bg-carbon-900 border border-carbon-800 text-titanium-dark cursor-not-allowed flex items-center gap-1"
              >
                Próximo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Drawer (Novo / Editar) */}
      <ProductDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        product={selectedProduct}
      />

      {/* Confirm Delete / Inactivate Modal */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Inativar Produto Metálico"
        description={`Tem certeza que deseja inativar o produto ${productToDelete?.sku}? O registro continuará preservado no banco para efeito de histórico de ordens e rastreabilidade de orçamentos.`}
        confirmLabel="Inativar Produto"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deleting}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
