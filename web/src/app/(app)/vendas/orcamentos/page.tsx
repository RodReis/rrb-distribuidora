import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { Suspense } from "react";
import { getQuoteFunnel, listQuotes } from "@/lib/quotes/service";
import { QuotesClient } from "./quotes-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    status?: string;
    channel?: string;
    q?: string;
    page?: string;
  }>;
}

export default async function OrcamentosPage({ searchParams }: PageProps) {
  if (!(await checkPermission("vendas_orcamentos", "read"))) {
    return <Forbidden module="Vendas & Orçamentos" />;
  }

  const user = await getCurrentUser();
  const canWrite = await checkPermission("vendas_orcamentos", "write");
  const params = (await searchParams) ?? {};

  const [data, funnel] = await Promise.all([
    listQuotes(user.tenantId, {
      status: params.status,
      channel: params.channel,
      search: params.q,
      page: Number(params.page ?? 1),
      pageSize: 20,
    }),
    getQuoteFunnel(user.tenantId),
  ]);

  return (
    <Suspense
      fallback={<div className="p-space-md text-titanium-muted">Carregando orçamentos…</div>}
    >
      <QuotesClient
        data={data}
        funnel={funnel}
        userRole={user.role}
        canWrite={canWrite}
        filters={{
          status: params.status ?? "todos",
          channel: params.channel ?? "todos",
          q: params.q ?? "",
        }}
      />
    </Suspense>
  );
}
