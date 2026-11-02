import {
  containsAny,
  containsNumber,
  inventedSkus,
  looksLikeRefusal,
  mentionsZero,
  type NumberTolerance,
} from "./match";

export type Check =
  /** Pelo menos uma das ferramentas foi chamada. */
  | { kind: "tool"; anyOf: string[] }
  /** Nenhuma ferramenta foi chamada. */
  | { kind: "noTools" }
  /** O parâmetro de uma chamada satisfaz o teste. */
  | {
      kind: "toolInput";
      tool: string;
      key: string;
      describe: string;
      test: (value: unknown) => boolean;
    }
  /** O valor aparece na resposta (formatação pt-BR tolerada). */
  | { kind: "number"; label: string; value: number; tol?: NumberTolerance }
  /** A resposta diz que o valor é zero/nenhum. */
  | { kind: "zero"; label: string }
  /** Pelo menos um dos textos aparece. */
  | { kind: "textAny"; label: string; items: string[] }
  /** Todos os textos aparecem. */
  | { kind: "textAll"; label: string; items: string[] }
  /** A resposta não contradiz a direção real (alta ou queda). */
  | { kind: "direction"; label: string; dir: "up" | "down" }
  /** A resposta é uma recusa. */
  | { kind: "refusal" };

export interface EvalCase {
  id: string;
  category: string;
  question: string;
  checks: Check[];
}

export interface RunResult {
  answer: string;
  toolCalls: { toolName: string; input: Record<string, unknown> }[];
  /** Exceções lançadas pelas ferramentas (ex.: banco fora do ar). */
  toolErrors?: string[];
}

export interface CaseOutcome {
  passed: boolean;
  failures: string[];
  /** Falha do ambiente (ferramenta lançou exceção): não conta contra o Copiloto. */
  infra?: boolean;
}

const UP_WORDS = ["subiu", "alta", "aument", "valoriz", "cresc", "elev", "positiv"];
const DOWN_WORDS = ["caiu", "queda", "reduc", "recuou", "diminu", "desvaloriz", "negativ", "baix"];

export function evaluateCase(
  c: EvalCase,
  run: RunResult,
  knownSkus: Iterable<string>
): CaseOutcome {
  const failures: string[] = [];
  const answer = run.answer.trim();

  if (run.toolErrors && run.toolErrors.length > 0) {
    return {
      passed: false,
      infra: true,
      failures: [`ferramenta lançou erro (ambiente instável?): ${run.toolErrors.join("; ")}`],
    };
  }

  if (!answer) {
    failures.push("resposta vazia");
    return { passed: false, failures };
  }

  const invented = inventedSkus(answer, knownSkus);
  if (invented.length > 0) failures.push(`SKU inexistente na resposta: ${invented.join(", ")}`);

  const calledTools = run.toolCalls.map((t) => t.toolName);

  for (const check of c.checks) {
    switch (check.kind) {
      case "tool":
        if (!check.anyOf.some((t) => calledTools.includes(t))) {
          failures.push(
            `ferramenta esperada (${check.anyOf.join(" ou ")}) não foi chamada; chamadas: ${calledTools.join(", ") || "nenhuma"}`
          );
        }
        break;
      case "noTools":
        if (calledTools.length > 0)
          failures.push(`não deveria chamar ferramentas, chamou: ${calledTools.join(", ")}`);
        break;
      case "toolInput": {
        const calls = run.toolCalls.filter((t) => t.toolName === check.tool);
        if (!calls.some((t) => check.test(t.input?.[check.key]))) {
          failures.push(
            `parâmetro ${check.tool}.${check.key} incorreto (esperado ${check.describe})`
          );
        }
        break;
      }
      case "number":
        if (!containsNumber(answer, check.value, check.tol)) {
          failures.push(`${check.label}: valor ${check.value} não aparece na resposta`);
        }
        break;
      case "zero":
        if (!mentionsZero(answer)) failures.push(`${check.label}: esperado zero/nenhum`);
        break;
      case "textAny":
        if (!containsAny(answer, check.items)) {
          failures.push(`${check.label}: nenhum de [${check.items.join(" | ")}] na resposta`);
        }
        break;
      case "textAll": {
        const missing = check.items.filter((i) => !containsAny(answer, [i]));
        if (missing.length > 0) failures.push(`${check.label}: faltou ${missing.join(", ")}`);
        break;
      }
      case "direction": {
        // Só reprova contradição: a direção pode vir implícita no sinal ("-2,55%").
        const right = containsAny(answer, check.dir === "up" ? UP_WORDS : DOWN_WORDS);
        const wrong = containsAny(answer, check.dir === "up" ? DOWN_WORDS : UP_WORDS);
        if (wrong && !right) {
          failures.push(
            `${check.label}: a resposta indica ${check.dir === "up" ? "queda" : "alta"}, mas houve ${check.dir === "up" ? "alta" : "queda"}`
          );
        }
        break;
      }
      case "refusal":
        if (!looksLikeRefusal(answer)) failures.push("deveria recusar o pedido");
        break;
    }
  }

  return { passed: failures.length === 0, failures };
}

export interface BatterySummary {
  /** Perguntas que realmente mediram o Copiloto (exclui falha de ambiente). */
  executed: number;
  passed: number;
  accuracy: number;
  /** Perguntas descartadas por falha de ambiente. */
  infra: number;
}

export function summarize(outcomes: CaseOutcome[]): BatterySummary {
  const measured = outcomes.filter((o) => !o.infra);
  const passed = measured.filter((o) => o.passed).length;
  return {
    executed: measured.length,
    passed,
    accuracy: measured.length === 0 ? 0 : passed / measured.length,
    infra: outcomes.length - measured.length,
  };
}

/** Aceite do PRD §18: 20 perguntas, acerto acima de 90%. */
export const ACCEPTANCE_QUESTIONS = 20;
export const ACCEPTANCE_ACCURACY = 0.9;

export function acceptanceVerdict(s: BatterySummary): "aprovado" | "reprovado" | "incompleto" {
  if (s.executed < ACCEPTANCE_QUESTIONS) return "incompleto";
  return s.accuracy > ACCEPTANCE_ACCURACY ? "aprovado" : "reprovado";
}
