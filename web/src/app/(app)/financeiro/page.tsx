import { getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { FINANCE_STATUS } from "@/lib/finance/capabilities";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await getCurrentUser();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs
        items={[{ label: "Início", href: "/dashboard" }, { label: "Financeiro & Risco" }]}
      />
      <PageHeader
        title="Financeiro & Risco"
        description="Origem e cobertura explícitas antes de qualquer indicador"
      />
      <section
        className="rounded-xl border border-carbon-700 bg-carbon-900 p-6 md:p-8"
        aria-labelledby="finance-status"
      >
        <h2 id="finance-status" className="mt-3 text-2xl font-semibold text-ice-white">
          Dados indisponíveis
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-carbon-300">
          {FINANCE_STATUS.reason} Títulos, limites, exposição e projeções não são exibidos até a
          origem e as regras serem aprovadas.
        </p>
        <dl className="mt-6 grid gap-4 border-t border-carbon-700 pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-carbon-400">Cobertura</dt>
            <dd className="mt-1 text-ice-white">Indisponível</dd>
          </div>
          <div>
            <dt className="text-carbon-400">Fonte</dt>
            <dd className="mt-1 text-ice-white">Não definida</dd>
          </div>
          <div>
            <dt className="text-carbon-400">Atualização</dt>
            <dd className="mt-1 text-ice-white">Sem dados</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
