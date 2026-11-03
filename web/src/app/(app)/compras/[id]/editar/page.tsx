import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/lib/db";
import { products, suppliers, warehouses } from "@/lib/db/schema";
import { getPurchaseCapabilities } from "@/lib/purchases/capabilities";
import { isEditable, PURCHASE_STATUS_LABEL } from "@/lib/purchases/state-machine";
import { getPurchaseOrder } from "@/lib/purchases/service";
import {
  PurchaseFormClient,
  type PurchaseFormInitial,
  type PurchaseFormProductOption,
  type PurchaseFormSupplierOption,
  type PurchaseFormWarehouseOption,
} from "@/components/features/purchases/purchase-form-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarCompraPage({ params }: PageProps) {
  if (!(await checkPermission("compras_rfq", "read"))) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const user = await getCurrentUser();
  const capabilities = getPurchaseCapabilities(user.role);
  if (!capabilities.includes("purchase.edit")) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const { id } = await params;
  const detail = await getPurchaseOrder({
    tenantId: user.tenantId,
    role: user.role,
    userId: user.id,
    id,
  });
  if (!detail) notFound();

  if (!isEditable(detail.order.status)) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Breadcrumbs
          items={[
            { label: "Início", href: "/dashboard" },
            { label: "Compras", href: "/compras" },
            { label: detail.order.numberLabel, href: `/compras/${detail.order.id}` },
            { label: "Editar" },
          ]}
        />
        <PageHeader
          title="Pedido fora da etapa de edição"
          description="Nenhuma alteração de conteúdo é permitida neste estado."
        />
        <div className="mx-auto mt-10 max-w-xl rounded border border-carbon-700/80 bg-carbon-900 p-space-md text-center">
          <h2 className="font-headline-sm text-headline-sm text-ice-white">
            Este pedido não pode mais ser editado
          </h2>
          <p className="mt-2 text-body-md text-titanium-muted">
            O pedido {detail.order.numberLabel} está em “
            {PURCHASE_STATUS_LABEL[detail.order.status]}
            ”. Somente rascunho, rejeitado, aprovado e aguardando alçada permitem edição; mudanças
            materiais após a emissão exigem cancelamento com justificativa e um novo pedido.
          </p>
          <Link
            href={`/compras/${detail.order.id}`}
            className="mt-4 inline-flex h-9 items-center justify-center rounded border border-titanium-steel/30 bg-carbon-800 px-3.5 text-body-md text-titanium-light transition-colors hover:border-titanium-steel/60 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
          >
            Ver detalhe do pedido
          </Link>
        </div>
      </div>
    );
  }

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

  const formSuppliers: PurchaseFormSupplierOption[] = supplierRows.some(
    (supplier) => supplier.id === detail.supplier.id
  )
    ? supplierRows
    : [...supplierRows, { ...detail.supplier }];
  const formWarehouses: PurchaseFormWarehouseOption[] = warehouseRows;

  // Produtos/itens atuais podem ter saído do catálogo ativo: mantém a opção para exibir e editar.
  const activeProductIds = new Set(productRows.map((product) => product.id));
  const missingProducts: PurchaseFormProductOption[] = detail.items
    .filter((item) => !activeProductIds.has(item.productId))
    .map((item) => ({
      id: item.productId,
      sku: item.sku,
      description: item.description,
      unit: item.unit,
    }));
  const formProducts: PurchaseFormProductOption[] = [...productRows, ...missingProducts];

  const initial: PurchaseFormInitial = {
    supplierId: detail.supplier.id,
    expectedDeliveryAt: detail.order.expectedDeliveryAt?.slice(0, 10) ?? "",
    items: detail.items.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: String(item.quantityOrdered).replace(".", ","),
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount > 0 ? item.discountAmount : null,
      notes: item.notes,
      additionalCosts: (item.additionalCosts ?? []).map((cost) => ({
        description: cost.description,
        amount: cost.amount,
      })),
    })),
  };

  return (
    <PurchaseFormClient
      mode="edit"
      orderId={detail.order.id}
      orderLabel={detail.order.numberLabel}
      initialStatus={detail.order.status}
      suppliers={formSuppliers}
      products={formProducts}
      warehouses={formWarehouses}
      initial={initial}
    />
  );
}
