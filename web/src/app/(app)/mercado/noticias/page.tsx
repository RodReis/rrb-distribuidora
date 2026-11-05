import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { NEWS_DISABLED_REASON } from "@/lib/market/news";

export default async function NewsPage() {
  await getCurrentUser();
  if (!(await checkPermission("inteligencia_mercado", "read")))
    return <Forbidden module="Inteligência & LME" />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Início", href: "/" },
          { label: "Inteligência & LME", href: "/mercado" },
          { label: "Notícias e regulação" },
        ]}
      />
      <PageHeader
        title="Notícias e regulação"
        description="Contexto de mercado e documentos regulatórios com fonte identificada"
      />
      <section
        className="rounded-xl border border-carbon-700 bg-carbon-900 p-6 md:p-8"
        aria-labelledby="news-status"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-400">
          Aguardando curadoria
        </p>
        <h2 id="news-status" className="text-xl font-semibold text-white">
          Feed indisponível
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-carbon-300">{NEWS_DISABLED_REASON}</p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-carbon-400">
          Nenhum conteúdo, sentimento ou vigência é publicado sem fonte autorizada e revisão
          definida.
        </p>
      </section>
    </div>
  );
}
