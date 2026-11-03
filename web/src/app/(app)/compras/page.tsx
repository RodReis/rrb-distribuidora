import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { checkPermission, getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { getActiveMatrixVersion } from "@/lib/purchases/approval-rules";
import { getPurchaseCapabilities } from "@/lib/purchases/capabilities";
import { getPurchaseSummary, listPurchaseOrders } from "@/lib/purchases/service";
import { PURCHASE_STATUSES } from "@/lib/purchases/state-machine";
import type { PurchaseCapability, PurchaseStatus } from "@/lib/purchases/types";
import {
  PurchasesClient,
  type PurchaseTab,
} from "@/components/features/purchases/purchases-client";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100];

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface PurchasesFilters {
  tab: PurchaseTab;
  status: string;
  supplierId: string;
  q: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toIsoDate(value: string, edge: "start" | "end"): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const suffix = edge === "start" ? "T00:00:00" : "T23:59:59.999";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default async function ComprasPage({ searchParams }: PageProps) {
  if (!(await checkPermission("compras_rfq", "read"))) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const user = await getCurrentUser();
  const capabilities = getPurchaseCapabilities(user.role);
  if (!capabilities.includes("purchase.read")) {
    return <Forbidden module="Compras & RFQ" />;
  }

  const params = (await searchParams) ?? {};
  const tabParam = first(params.tab);
  const tab: PurchaseTab = tabParam === "aprovacoes" || tabParam === "receber" ? tabParam : "todos";

  const pageSizeRaw = Number(first(params.pageSize) ?? 25);
  const pageSize = PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 25;
  const pageRaw = Number(first(params.page) ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  // Cada aba força o recorte de status correspondente; na aba "Todos" vale o filtro explícito.
  const statusParam = first(params.status) ?? "todos";
  const status =
    tab === "aprovacoes"
      ? "submetido"
      : tab === "receber"
        ? "emitido"
        : PURCHASE_STATUSES.includes(statusParam as PurchaseStatus)
          ? statusParam
          : "todos";

  const filters: PurchasesFilters = {
    tab,
    status,
    supplierId: first(params.supplierId) ?? "todos",
    q: first(params.q) ?? "",
    from: first(params.from) ?? "",
    to: first(params.to) ?? "",
    page,
    pageSize,
  };

  return (
    <Suspense fallback={<PurchasesSkeleton />}>
      <PurchasesSection user={user} capabilities={capabilities} filters={filters} />
    </Suspense>
  );
}

async function PurchasesSection({
  user,
  capabilities,
  filters,
}: {
  user: CurrentUserSession;
  capabilities: PurchaseCapability[];
  filters: PurchasesFilters;
}) {
  const [data, summary, activeMatrixVersion, supplierRows] = await Promise.all([
    listPurchaseOrders({
      tenantId: user.tenantId,
      role: user.role,
      userId: user.id,
      filters: {
        status: filters.status,
        supplierId: filters.supplierId,
        search: filters.q || undefined,
        from: toIsoDate(filters.from, "start"),
        to: toIsoDate(filters.to, "end"),
        page: filters.page,
        pageSize: filters.pageSize,
      },
    }),
    getPurchaseSummary({ tenantId: user.tenantId, role: user.role, userId: user.id }),
    getActiveMatrixVersion(user.tenantId),
    db
      .select({
        id: suppliers.id,
        legalName: suppliers.legalName,
        tradeName: suppliers.tradeName,
      })
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, user.tenantId), eq(suppliers.active, true)))
      .orderBy(asc(suppliers.legalName)),
  ]);

  return (
    <PurchasesClient
      data={data}
      summary={summary}
      filters={{
        status: filters.status,
        supplierId: filters.supplierId,
        q: filters.q,
        from: filters.from,
        to: filters.to,
        tab: filters.tab,
      }}
      suppliers={supplierRows.map((row) => ({
        id: row.id,
        name: row.tradeName || row.legalName,
      }))}
      capabilities={capabilities}
      activeMatrixVersion={activeMatrixVersion}
    />
  );
}

/** Skeleton da lista: mantém a malha de KPIs e a densidade da tabela durante o streaming. */
function PurchasesSkeleton() {
  return (
    <div className="flex flex-col gap-space-md" aria-busy="true" aria-label="Carregando compras">
      <div className="h-3 w-40 animate-pulse rounded bg-carbon-800" />
      <div className="flex items-center justify-between border-b border-carbon-800 pb-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-32 animate-pulse rounded bg-carbon-800" />
          <div className="h-3 w-72 animate-pulse rounded bg-carbon-800" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded bg-carbon-800" />
      </div>
      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex h-24 flex-col justify-between rounded-md border border-carbon-800 bg-carbon-900 p-3"
          >
            <div className="h-2.5 w-24 animate-pulse rounded bg-carbon-800" />
            <div className="h-6 w-32 animate-pulse rounded bg-carbon-800" />
            <div className="h-2 w-40 animate-pulse rounded bg-carbon-800" />
          </div>
        ))}
      </div>
      <div className="h-7 w-full animate-pulse rounded bg-carbon-800" />
      <div className="flex flex-col overflow-hidden rounded border border-carbon-700/80 bg-carbon-900">
        <div className="border-b border-carbon-800 bg-carbon-950 px-4 py-3">
          <div className="h-3 w-44 animate-pulse rounded bg-carbon-800" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-carbon-800/60 px-4 py-3"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-carbon-800" />
            <div className="h-3 flex-1 animate-pulse rounded bg-carbon-800" />
            <div className="h-3 w-24 animate-pulse rounded bg-carbon-800" />
            <div className="h-3 w-28 animate-pulse rounded bg-carbon-800" />
            <div className="h-3 w-16 animate-pulse rounded bg-carbon-800" />
            <div className="h-5 w-24 animate-pulse rounded bg-carbon-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
