/**
 * Markdown mínimo para texto gerado pelo modelo: só **negrito** e remoção de marcadores de título (#).
 * Não interpreta HTML nem links: o texto continua sendo renderizado como texto.
 */
export interface InlineSegment {
  text: string;
  bold: boolean;
}

/** Remove `#`, `##`... do começo da linha (o modelo às vezes devolve títulos markdown). */
export function stripHeadingMarks(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s+/, "");
}

export function splitBold(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const pattern = /\*\*([^*\n]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index), bold: false });
    out.push({ text: match[1], bold: true });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length ? out : [{ text, bold: false }];
}

/** Plural simples em português: 1 → singular, o resto → plural. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
