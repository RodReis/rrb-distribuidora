import { and, asc, eq } from "drizzle-orm";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { products, suppliers, warehouses } from "@/lib/db/schema";
import { getPurchaseCapabilities } from "@/lib/purchases/capabilities";
import {
  PurchaseFormClient,
  type PurchaseFormInitial,
  type PurchaseFormProductOption,
  type PurchaseFormStockSuggestion,
  type PurchaseFormSupplierOption,
  type PurchaseFormWarehouseOption,
} from "@/components/features/purchases/purchase-form-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ productId?: string | string[]; quantity?: string | string[] }>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toQuantityNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Aceita "1.234,5" (pt-BR) e "1234.5" (ponto decimal puro).
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `/compras/nova` — rascunho de pedido de compra.
 *
 * Aceita `productId` e `quantity` (sugestão de compra do estoque, M2): a primeira
 * linha já vem com produto e quantidade ESTIMADA; fornecedor e preço continuam
 * vazios porque a sugestão não conhece negociação nem fornecedor.
 */
export default async function NovaCompraPage({ searchParams }: PageProps) {
  if (!(await checkPermission("compras_rfq", "read"))) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const user = await getCurrentUser();
  const capabilities = getPurchaseCapabilities(user.role);
  if (!capabilities.includes("purchase.create")) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const params = (await searchParams) ?? {};
  const requestedProductId = first(params.productId);
  const requestedQuantity = toQuantityNumber(first(params.quantity));

  const [supplierRows, productRows, warehouseRows] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        legalName: suppliers.legalName,
        tradeName: suppliers.tradeName,
        cnpj: suppliers.cnpj,
        city: suppliers.city,
        uf: suppliers.uf,
        paymentTerms: suppliers.paymentTerms,
      })
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, user.tenantId), eq(suppliers.active, true)))
      .orderBy(asc(suppliers.legalName)),
    db
      .select({
        id: products.id,
        sku: products.sku,
        description: products.commercialDescription,
        unit: products.unit,
      })
      .from(products)
      .where(and(eq(products.tenantId, user.tenantId), eq(products.status, "ativo")))
      .orderBy(asc(products.commercialDescription)),
    db
      .select({ id: warehouses.id, name: warehouses.name, type: warehouses.type })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, user.tenantId), eq(warehouses.active, true)))
      .orderBy(asc(warehouses.name)),
  ]);

  const formSuppliers: PurchaseFormSupplierOption[] = supplierRows;
  const formProducts: PurchaseFormProductOption[] = productRows;
  const formWarehouses: PurchaseFormWarehouseOption[] = warehouseRows;

  if (formSuppliers.length === 0 || formProducts.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Breadcrumbs
          items={[
            { label: "Início", href: "/dashboard" },
            { label: "Compras", href: "/compras" },
            { label: "Novo pedido" },
          ]}
        />
        <PageHeader title="Novo pedido de compra" description="Rascunho de compra operacional" />
        <div className="mx-auto mt-10 max-w-xl rounded border border-carbon-700/80 bg-carbon-900 p-space-md text-center">
          <h2 className="font-headline-sm text-headline-sm text-ice-white">
            Cadastros incompletos para comprar
          </h2>
          <p className="mt-2 text-body-md text-titanium-muted">
            É necessário ao menos um fornecedor ativo e um produto metálico ativo antes de criar um
            pedido de compra. Cadastre-os nos módulos de Fornecedores e Produtos.
          </p>
        </div>
      </div>
    );
  }

  const suggestionProduct = requestedProductId
    ? formProducts.find((product) => product.id === requestedProductId)
    : undefined;
  const stockSuggestion: PurchaseFormStockSuggestion | null =
    suggestionProduct && requestedQuantity != null
      ? { productId: suggestionProduct.id, quantity: requestedQuantity }
      : null;

  const initial: PurchaseFormInitial = {
    supplierId: "",
    expectedDeliveryAt: "",
    items: stockSuggestion
      ? [
          {
            productId: stockSuggestion.productId,
            // Quantidade estimada: texto pt-BR editável; preço e fornecedor ficam vazios.
            quantity: String(stockSuggestion.quantity).replace(".", ","),
            unitPrice: null,
          },
        ]
      : [],
  };

  return (
    <PurchaseFormClient
      mode="create"
      suppliers={formSuppliers}
      products={formProducts}
      warehouses={formWarehouses}
      initial={initial}
      stockSuggestion={stockSuggestion}
    />
  );
}
