import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { loadBuilderCatalog } from "@/lib/quotes/builder-data";
import { QuoteBuilder } from "../quote-builder";

export const dynamic = "force-dynamic";

export default async function NovoOrcamentoPage() {
  if (!(await checkPermission("vendas_orcamentos", "write"))) {
    return <Forbidden module="Vendas & Orçamentos" />;
  }

  const user = await getCurrentUser();
  const catalog = await loadBuilderCatalog(user.tenantId);

  if (catalog.customers.length === 0 || catalog.products.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded border border-carbon-700/80 bg-carbon-900 p-space-md text-center">
        <h1 className="font-headline-sm text-headline-sm text-ice-white">
          Cadastros incompletos para orçamentar
        </h1>
        <p className="mt-2 text-body-md text-titanium-muted">
          É necessário ao menos um cliente ativo e um produto metálico ativo antes de criar um
          orçamento.
        </p>
      </div>
    );
  }

  return <QuoteBuilder catalog={catalog} />;
}
