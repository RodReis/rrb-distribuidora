import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { purchaseOrders, warehouses } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { hasPurchaseCapability } from "@/lib/purchases/capabilities";
import { getPurchaseOrder } from "@/lib/purchases/service";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import {
  isPurchaseDetailTab,
  type PurchaseDetailTab,
} from "@/components/features/purchases/purchase-detail-utils";
import { PurchaseDetailClient } from "@/components/features/purchases/purchase-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}

/**
 * Detalhe do pedido de compra (LAC-01 §8).
 *
 * O servidor resolve a capability `purchase.read` (não o `can_write` do módulo),
 * carrega o pedido pela camada de serviço (tenant sempre aplicado) e os depósitos
 * ativos usados no formulário de recebimento. Toda mutação acontece no cliente
 * via API, que revalida estado/alçada/hash no servidor.
 */
export default async function CompraDetalhePage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!hasPurchaseCapability(user.role, "purchase.read")) {
    return <Forbidden module="Compras" />;
  }

  const { id } = await params;
  const detail = await getPurchaseOrder({
    tenantId: user.tenantId,
    role: user.role,
    userId: user.id,
    id,
  });
  if (!detail) notFound();

  const [activeWarehouses, ownership] = await Promise.all([
    db
      .select({ id: warehouses.id, name: warehouses.name })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, user.tenantId), eq(warehouses.active, true)))
      .orderBy(asc(warehouses.name)),
    db
      .select({ createdBy: purchaseOrders.createdBy })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, user.tenantId)))
      .limit(1),
  ]);

  const query = (searchParams ? await searchParams : {}) ?? {};
  const requestedTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const initialTab: PurchaseDetailTab = isPurchaseDetailTab(requestedTab) ? requestedTab : "itens";

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-space-md pb-4">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/dashboard" },
          { label: "Compras", href: "/compras" },
          { label: detail.order.numberLabel },
        ]}
      />
      <PurchaseDetailClient
        initialDetail={detail}
        warehouses={activeWarehouses}
        isCreator={ownership[0]?.createdBy === user.id}
        initialTab={initialTab}
      />
    </div>
  );
}

export const metadata = {
  title: "Pedido de compra · Compras",
};
