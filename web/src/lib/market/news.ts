export type NewsRights = "none" | "metadata" | "full";

export interface NewsDisplayInput {
  id: string;
  sourceName: string;
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  body: string | null;
  evidence: string | null;
  rights: NewsRights;
}

export function permittedNewsFields(item: NewsDisplayInput) {
  if (item.rights === "none") return null;
  const metadata = {
    id: item.id,
    sourceName: item.sourceName,
    title: item.title,
    canonicalUrl: item.canonicalUrl,
    publishedAt: item.publishedAt,
  };
  if (item.rights === "full") return { ...metadata, body: item.body, evidence: item.evidence };
  return metadata;
}

export function effectiveLabel(from: Date | null, until: Date | null): string {
  if (!from) return "Vigência indeterminada";
  if (!until) return `Vigente desde ${from.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
  return `${from.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a ${until.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
}
