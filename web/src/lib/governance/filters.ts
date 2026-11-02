/** Parte pura da trilha de auditoria de IA (sem banco), segura para o navegador. */

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type FeedbackFilter = "todos" | "positivo" | "negativo" | "sem";

export interface AuditFilters {
  agent: string;
  feedback: FeedbackFilter;
  q: string;
  page: number;
  size: PageSize;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseAuditFilters(params: Params): AuditFilters {
  const size = Number(first(params.size));
  const page = Number(first(params.page));
  const feedback = first(params.feedback);
  return {
    agent: (first(params.agente) ?? "").trim(),
    feedback:
      feedback === "positivo" || feedback === "negativo" || feedback === "sem" ? feedback : "todos",
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : 25,
  };
}

/** Escapa curingas do LIKE para a busca por texto literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function totalPages(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}
