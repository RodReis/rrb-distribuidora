import { describe, expect, it } from "vitest";
import { acceptanceVerdict, evaluateCase, summarize, type EvalCase } from "./evaluate";

const SKUS = ["SKU-ALU-5052-476", "SKU-A36-CG-127"];

const base: EvalCase = {
  id: "t-01",
  category: "Teste",
  question: "?",
  checks: [],
};

const run = (answer: string, tools: string[] = [], input: Record<string, unknown> = {}) => ({
  answer,
  toolCalls: tools.map((toolName) => ({ toolName, input })),
});

describe("evaluateCase — regras gerais", () => {
  it("resposta vazia reprova (bug de laço de ferramentas sem texto final)", () => {
    const out = evaluateCase(
      { ...base, checks: [{ kind: "tool", anyOf: ["x"] }] },
      run("  ", ["x"]),
      SKUS
    );
    expect(out.passed).toBe(false);
    expect(out.failures).toEqual(["resposta vazia"]);
  });

  it("SKU inventado reprova mesmo se o resto estiver certo", () => {
    const out = evaluateCase(base, run("Repor SKU-ALU-5052-999 agora."), SKUS);
    expect(out.passed).toBe(false);
    expect(out.failures[0]).toContain("SKU-ALU-5052-999");
  });

  it("exceção de ferramenta vira falha de ambiente, não erro do Copiloto", () => {
    const out = evaluateCase(
      { ...base, checks: [{ kind: "number", label: "n", value: 1 }] },
      {
        answer: "Houve um erro na consulta.",
        toolCalls: [],
        toolErrors: ["consultar_x: connection refused"],
      },
      SKUS
    );
    expect(out.infra).toBe(true);
    expect(out.passed).toBe(false);
    expect(out.failures[0]).toContain("connection refused");
  });

  it("sem checagens e com resposta válida passa", () => {
    expect(evaluateCase(base, run("Tudo certo."), SKUS).passed).toBe(true);
  });
});

describe("evaluateCase — ferramentas", () => {
  it("exige a ferramenta esperada", () => {
    const c: EvalCase = { ...base, checks: [{ kind: "tool", anyOf: ["a", "b"] }] };
    expect(evaluateCase(c, run("ok", ["b"]), SKUS).passed).toBe(true);
    const bad = evaluateCase(c, run("ok", ["z"]), SKUS);
    expect(bad.passed).toBe(false);
    expect(bad.failures[0]).toContain("não foi chamada");
  });

  it("noTools reprova quando há chamada", () => {
    const c: EvalCase = { ...base, checks: [{ kind: "noTools" }] };
    expect(evaluateCase(c, run("ok"), SKUS).passed).toBe(true);
    expect(evaluateCase(c, run("ok", ["a"]), SKUS).passed).toBe(false);
  });

  it("valida o parâmetro da chamada", () => {
    const c: EvalCase = {
      ...base,
      checks: [
        {
          kind: "toolInput",
          tool: "a",
          key: "dias",
          describe: "15",
          test: (v) => Number(v) === 15,
        },
      ],
    };
    expect(evaluateCase(c, run("ok", ["a"], { dias: 15 }), SKUS).passed).toBe(true);
    expect(evaluateCase(c, run("ok", ["a"], { dias: 7 }), SKUS).passed).toBe(false);
  });
});

describe("evaluateCase — conteúdo", () => {
  it("número: aceita formatação pt-BR", () => {
    const c: EvalCase = {
      ...base,
      checks: [{ kind: "number", label: "total", value: 12345.6, tol: { rel: 0.001 } }],
    };
    expect(evaluateCase(c, run("Total de R$ 12.345,60."), SKUS).passed).toBe(true);
    expect(evaluateCase(c, run("Total de R$ 99,00."), SKUS).passed).toBe(false);
  });

  it("zero: aceita 'nenhum'", () => {
    const c: EvalCase = { ...base, checks: [{ kind: "zero", label: "bloqueados" }] };
    expect(evaluateCase(c, run("Nenhum orçamento bloqueado."), SKUS).passed).toBe(true);
    expect(evaluateCase(c, run("Há 3 orçamentos bloqueados."), SKUS).passed).toBe(false);
  });

  it("textAll lista o que faltou", () => {
    const c: EvalCase = { ...base, checks: [{ kind: "textAll", label: "SKUs", items: SKUS }] };
    const out = evaluateCase(c, run("Somente SKU-ALU-5052-476."), SKUS);
    expect(out.passed).toBe(false);
    expect(out.failures[0]).toContain("SKU-A36-CG-127");
  });

  it("direção: reprova só a contradição, aceita direção implícita", () => {
    const up: EvalCase = { ...base, checks: [{ kind: "direction", label: "dólar", dir: "up" }] };
    expect(evaluateCase(up, run("O dólar subiu 2%."), SKUS).passed).toBe(true);
    expect(evaluateCase(up, run("A variação do dólar foi de 2%."), SKUS).passed).toBe(true);
    expect(evaluateCase(up, run("O dólar caiu 2%."), SKUS).passed).toBe(false);

    const down: EvalCase = {
      ...base,
      checks: [{ kind: "direction", label: "alumínio", dir: "down" }],
    };
    expect(evaluateCase(down, run("A variação foi de -2,55%."), SKUS).passed).toBe(true);
    expect(evaluateCase(down, run("O alumínio subiu 2,55%."), SKUS).passed).toBe(false);
  });

  it("recusa", () => {
    const c: EvalCase = { ...base, checks: [{ kind: "refusal" }] };
    expect(evaluateCase(c, run("Não posso executar SQL, sou somente leitura."), SKUS).passed).toBe(
      true
    );
    expect(evaluateCase(c, run("Aqui está o resultado: 3 linhas."), SKUS).passed).toBe(false);
  });
});

describe("summarize e acceptanceVerdict", () => {
  const outcomes = (passed: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ passed: i < passed, failures: [] }));

  it("calcula a acurácia", () => {
    expect(summarize(outcomes(19, 20))).toEqual({
      executed: 20,
      passed: 19,
      accuracy: 0.95,
      infra: 0,
    });
    expect(summarize([]).accuracy).toBe(0);
  });

  it("falha de ambiente fica fora da acurácia e deixa o aceite incompleto", () => {
    const mixed = [
      ...outcomes(17, 17),
      { passed: false, failures: ["x"], infra: true },
      { passed: false, failures: ["x"], infra: true },
      { passed: false, failures: ["x"], infra: true },
    ];
    const s = summarize(mixed);
    expect(s).toEqual({ executed: 17, passed: 17, accuracy: 1, infra: 3 });
    expect(acceptanceVerdict(s)).toBe("incompleto");
  });

  it("aceite do PRD: 20 perguntas e acerto estritamente acima de 90%", () => {
    expect(acceptanceVerdict(summarize(outcomes(20, 20)))).toBe("aprovado");
    expect(acceptanceVerdict(summarize(outcomes(19, 20)))).toBe("aprovado");
    expect(acceptanceVerdict(summarize(outcomes(18, 20)))).toBe("reprovado");
  });

  it("com menos de 20 perguntas executadas fica incompleto", () => {
    expect(acceptanceVerdict(summarize(outcomes(17, 17)))).toBe("incompleto");
  });
});
