import { checkPermission, getCurrentUser } from "@/lib/auth/rbac";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { Forbidden } from "@/components/shared/forbidden";
import { PageHeader } from "@/components/shared/page-header";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { effectiveLabel } from "@/lib/market/news";
import { listNews, listRegulatory, listSources } from "@/lib/market/news-service";
import { NewsAdmin } from "./news-admin";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const user = await getCurrentUser();
  if (!(await checkPermission("inteligencia_mercado", "read")))
    return <Forbidden module="Inteligência & LME" />;

  const canManage =
    (await checkPermission("inteligencia_mercado", "write")) &&
    hasMarketCapability(user.role, "market.news.manage");
  const canReadRegulatory = hasMarketCapability(user.role, "market.regulatory.read");
  const [news, regulatory, sources] = await Promise.all([
    listNews(user.tenantId),
    canReadRegulatory ? listRegulatory(user.tenantId) : Promise.resolve([]),
    canManage ? listSources(user.tenantId) : Promise.resolve([]),
  ]);

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
        description="Fontes identificadas, curadoria humana e documentos primários"
      />
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-5 py-4 text-sm leading-6 text-amber-100">
        Informações para contexto. Registros regulatórios indicam possível relevância; não
        determinam incidência legal, fiscal ou decisão automática de preço.
      </div>
      {canManage && (
        <NewsAdmin
          sources={sources}
          news={news.map((item) => ({ id: item.id, title: item.title }))}
          regulatory={regulatory.map((item) => ({
            id: item.id,
            label: `${item.authority} · ${item.actId}`,
          }))}
        />
      )}

      <section aria-labelledby="news-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="news-heading" className="text-xl font-semibold text-white">
            Notícias
          </h2>
          <span className="text-xs text-carbon-400">Metadados e links autorizados</span>
        </div>
        {news.length === 0 ? (
          <div className="rounded-xl border border-carbon-700 bg-carbon-900 p-6 text-sm text-carbon-300">
            Nenhuma notícia com fonte autorizada.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {news.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-carbon-700 bg-carbon-900 p-5"
              >
                <p className="text-xs uppercase tracking-wide text-amber-400">{item.sourceName}</p>
                <h3 className="mt-2 text-base font-semibold leading-6 text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-carbon-400">
                  {item.publishedAt
                    ? new Date(item.publishedAt).toLocaleDateString("pt-BR")
                    : "Publicação não informada"}{" "}
                  · Versão {item.version}
                </p>
                <p className="mt-3 text-sm text-carbon-300">
                  {item.classification
                    ? `${item.classification.origin}: ${Array.isArray(item.classification.labels) ? item.classification.labels.join(", ") : "Sem rótulos"}${item.classification.sentiment ? ` · ${item.classification.sentiment}` : ""}`
                    : "Sem classificação revisada."}
                </p>
                {item.classification && (
                  <p className="mt-1 text-xs text-carbon-400">
                    Origem: {item.classification.modelVersion} · Confiança:{" "}
                    {item.classification.confidence ?? "não se aplica"} · Revisão:{" "}
                    {item.classification.reviewedAt
                      ? new Date(item.classification.reviewedAt).toLocaleDateString("pt-BR")
                      : "não informada"}
                  </p>
                )}
                <a
                  className="mt-4 inline-block text-sm font-medium text-amber-400 underline underline-offset-4"
                  href={item.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir fonte ↗
                </a>
              </article>
            ))}
          </div>
        )}
      </section>

      {canReadRegulatory && (
        <section aria-labelledby="regulatory-heading" className="space-y-4">
          <h2 id="regulatory-heading" className="text-xl font-semibold text-white">
            Publicações regulatórias
          </h2>
          {regulatory.length === 0 ? (
            <div className="rounded-xl border border-carbon-700 bg-carbon-900 p-6 text-sm text-carbon-300">
              Nenhum registro revisado cadastrado.
            </div>
          ) : (
            <div className="space-y-3">
              {regulatory.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-carbon-700 bg-carbon-900 p-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-carbon-400">
                    <span className="font-semibold uppercase tracking-wide text-amber-400">
                      {item.authority}
                    </span>
                    <span>{item.jurisdiction}</span>
                    <span>· {item.actId}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-white">{item.subject}</h3>
                  <p className="mt-2 text-sm text-carbon-300">
                    {effectiveLabel(item.effectiveFrom, item.effectiveUntil)} · {item.status} ·
                    versão {item.version}
                  </p>
                  <p className="mt-1 text-xs text-carbon-400">
                    Possível relevância. Alcance jurídico não avaliado pelo sistema.
                  </p>
                  <a
                    className="mt-3 inline-block text-sm font-medium text-amber-400 underline underline-offset-4"
                    href={item.primarySourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir documento primário ↗
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
