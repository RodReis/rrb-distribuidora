/**
 * Regras puras do Command Center (MVP-04). Sem acesso a banco, para teste determinístico.
 *
 * Nenhum limite novo foi criado aqui: a severidade de mercado usa os mesmos cortes de
 * volatilidade semanal da validade dinâmica de propostas (MVP-03: > 1,5% e > 3%).
 */

export type Level = "ok" | "attention" | "risk" | "info" | "nodata";

export const VOLATILITY_ATTENTION_PCT = 1.5;
export const VOLATILITY_RISK_PCT = 3;

const RANK: Record<Level, number> = { nodata: 0, info: 0, ok: 1, attention: 2, risk: 3 };

export function volatilityLevel(change7dPct: number | null): Level {
  if (change7dPct == null || !Number.isFinite(change7dPct)) return "nodata";
  const v = Math.abs(change7dPct);
  if (v > VOLATILITY_RISK_PCT) return "risk";
  if (v > VOLATILITY_ATTENTION_PCT) return "attention";
  return "ok";
}

export function stockLevel(criticalCount: number, warningCount: number): Level {
  if (criticalCount > 0) return "risk";
  if (warningCount > 0) return "attention";
  return "ok";
}

export function quotesLevel(blockedCount: number): Level {
  return blockedCount > 0 ? "attention" : "ok";
}

/** Pior nível entre os que têm dado. `info` e `nodata` não entram na conta. */
export function worstLevel(levels: Level[]): Level {
  let worst: Level = "nodata";
  for (const level of levels) {
    if (level === "nodata" || level === "info") continue;
    if (worst === "nodata" || RANK[level] > RANK[worst]) worst = level;
  }
  return worst;
}

/** Diferença em pontos percentuais; null quando falta qualquer um dos lados. */
export function marginDeltaPp(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Number((current - previous).toFixed(1));
}

export interface Recommendation {
  id: string;
  department: string;
  action: string;
  detail: string;
  /** Valor envolvido em R$ (nem sempre é perda: pode ser receita ou capital em jogo). */
  amountBrl: number | null;
  href: string;
}

export function rankRecommendations(items: Recommendation[], limit = 8): Recommendation[] {
  return [...items].sort((a, b) => (b.amountBrl ?? -1) - (a.amountBrl ?? -1)).slice(0, limit);
}

export type BriefingSectionKey = "attention" | "market" | "quotes";

export interface BriefingSection {
  key: BriefingSectionKey;
  title: string;
  body: string;
}

const SECTION_MATCHERS: { key: BriefingSectionKey; match: RegExp }[] = [
  { key: "attention", match: /aten[cç][aã]o imediata/i },
  { key: "market", match: /oportunidades de compra/i },
  { key: "quotes", match: /propostas comerciais/i },
];

/**
 * Quebra o texto do briefing nas 3 seções exigidas no prompt. Retorna lista vazia
 * quando o modelo não respeitou os títulos (a tela mostra o texto inteiro).
 */
export function splitBriefingSections(text: string): BriefingSection[] {
  const sections: { key: BriefingSectionKey; title: string; lines: string[] }[] = [];
  let current: (typeof sections)[number] | null = null;

  for (const line of text.split("\n")) {
    const clean = line.replace(/[#*_`]/g, "").trim();
    const hit =
      clean.length > 0 && clean.length < 90
        ? SECTION_MATCHERS.find((s) => s.match.test(clean))
        : undefined;
    if (hit) {
      current = { key: hit.key, title: clean, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  return sections
    .map((s) => ({ key: s.key, title: s.title, body: s.lines.join("\n").trim() }))
    .filter((s) => s.body.length > 0);
}

export function isBriefingFromToday(briefingDate: string, today: string): boolean {
  return briefingDate === today;
}
