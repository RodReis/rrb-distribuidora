"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClass =
  "mt-1 w-full rounded-md border border-carbon-600 bg-carbon-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-400";
const buttonClass =
  "mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-carbon-950 hover:bg-amber-400 disabled:opacity-50";

type Source = { id: string; name: string };
type News = { id: string; title: string };
type Regulatory = { id: string; label: string };

function Field({
  label,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-carbon-200">
      {label}
      <input className={inputClass} name={name} type={type} required={required} />
    </label>
  );
}

export function NewsAdmin({
  sources,
  news,
  regulatory,
}: {
  sources: Source[];
  news: News[];
  regulatory: Regulatory[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function send(
    event: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => Record<string, unknown>
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(build(new FormData(form))),
      });
      if (!response.ok) throw new Error(`Falha ao salvar (${response.status}).`);
      setMessage("Registro salvo.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setPending(false);
    }
  }

  const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
  const optional = (form: FormData, key: string) => value(form, key) || undefined;

  return (
    <section
      aria-labelledby="curation-heading"
      className="rounded-xl border border-carbon-700 bg-carbon-900 p-5 md:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="curation-heading" className="text-lg font-semibold text-white">
          Curadoria manual
        </h2>
        <span className="text-xs text-carbon-400">
          Acesso de administrador · histórico preservado
        </span>
      </div>
      <p className="mt-2 text-sm text-carbon-300">
        Registre somente fontes com autorização documentada. Notícias exibem metadados e link; texto
        integral e coleta automática não são usados.
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm text-amber-300">
          {message}
        </p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <details className="rounded-lg border border-carbon-700 p-4">
          <summary className="cursor-pointer font-medium text-white">Cadastrar fonte</summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) =>
              send(event, "/api/news/sources", (form) => ({
                name: value(form, "name"),
                sourceUrl: value(form, "sourceUrl"),
                licenseReference: value(form, "licenseReference"),
                retentionPolicy: value(form, "retentionPolicy"),
              }))
            }
          >
            <Field label="Nome da fonte" name="name" required />
            <Field label="URL da fonte" name="sourceUrl" type="url" required />
            <Field label="Referência da licença ou autorização" name="licenseReference" required />
            <Field label="Política de retenção autorizada" name="retentionPolicy" required />
            <button className={buttonClass} disabled={pending}>
              Salvar fonte
            </button>
          </form>
        </details>

        <details className="rounded-lg border border-carbon-700 p-4">
          <summary className="cursor-pointer font-medium text-white">Cadastrar notícia</summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) =>
              send(event, "/api/news", (form) => ({
                sourceId: value(form, "sourceId"),
                externalId: value(form, "externalId"),
                title: value(form, "title"),
                canonicalUrl: value(form, "canonicalUrl"),
                publishedAt: optional(form, "publishedAt"),
                correctionOf: optional(form, "correctionOf"),
                withdrawn: form.get("withdrawn") === "on",
              }))
            }
          >
            <label className="block text-sm text-carbon-200">
              Fonte
              <select className={inputClass} name="sourceId" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="ID na fonte" name="externalId" required />
            <Field label="Título publicado" name="title" required />
            <Field label="URL canônica" name="canonicalUrl" type="url" required />
            <Field label="Publicação (se confirmada)" name="publishedAt" type="date" />
            <label className="block text-sm text-carbon-200">
              Versão corrigida (se aplicável)
              <select className={inputClass} name="correctionOf">
                <option value="">Nova notícia</option>
                {news.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-carbon-200">
              <input type="checkbox" name="withdrawn" /> Retirar notícia do feed nesta versão
            </label>
            <button className={buttonClass} disabled={pending || sources.length === 0}>
              Salvar notícia
            </button>
          </form>
        </details>

        <details className="rounded-lg border border-carbon-700 p-4">
          <summary className="cursor-pointer font-medium text-white">Revisar classificação</summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) =>
              send(
                event,
                `/api/news/${value(new FormData(event.currentTarget), "itemId")}/review`,
                (form) => ({
                  labels: value(form, "labels")
                    .split(",")
                    .map((label) => label.trim())
                    .filter(Boolean),
                  sentiment: optional(form, "sentiment") ?? null,
                  decision: value(form, "decision"),
                })
              )
            }
          >
            <label className="block text-sm text-carbon-200">
              Notícia
              <select className={inputClass} name="itemId" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {news.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Rótulos separados por vírgula" name="labels" />
            <Field label="Sentimento (opcional)" name="sentiment" />
            <label className="block text-sm text-carbon-200">
              Decisão
              <select className={inputClass} name="decision">
                <option value="approved">Aprovar</option>
                <option value="rejected">Rejeitar</option>
              </select>
            </label>
            <button className={buttonClass} disabled={pending || news.length === 0}>
              Registrar revisão
            </button>
          </form>
        </details>

        <details className="rounded-lg border border-carbon-700 p-4">
          <summary className="cursor-pointer font-medium text-white">
            Cadastrar ato regulatório
          </summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) =>
              send(event, "/api/regulatory", (form) => ({
                authority: value(form, "authority"),
                actId: value(form, "actId"),
                jurisdiction: value(form, "jurisdiction"),
                subject: value(form, "subject"),
                publishedAt: optional(form, "publishedAt"),
                effectiveFrom: optional(form, "effectiveFrom"),
                effectiveUntil: optional(form, "effectiveUntil"),
                status: value(form, "status"),
                primarySourceUrl: value(form, "primarySourceUrl"),
                supersedesId: optional(form, "supersedesId"),
              }))
            }
          >
            <Field label="Autoridade" name="authority" required />
            <Field label="Identificador do ato" name="actId" required />
            <Field label="Jurisdição" name="jurisdiction" required />
            <Field label="Assunto" name="subject" required />
            <Field label="URL do documento primário" name="primarySourceUrl" type="url" required />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Publicação" name="publishedAt" type="date" />
              <Field label="Vigência inicial" name="effectiveFrom" type="date" />
              <Field label="Vigência final" name="effectiveUntil" type="date" />
            </div>
            <label className="block text-sm text-carbon-200">
              Estado registrado
              <select className={inputClass} name="status">
                <option value="indeterminado">Indeterminado</option>
                <option value="publicado">Publicado</option>
                <option value="alterado">Alterado</option>
                <option value="revogado">Revogado</option>
              </select>
            </label>
            <label className="block text-sm text-carbon-200">
              Versão substituída (se aplicável)
              <select className={inputClass} name="supersedesId">
                <option value="">Novo ato</option>
                {regulatory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button className={buttonClass} disabled={pending}>
              Salvar ato
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}
