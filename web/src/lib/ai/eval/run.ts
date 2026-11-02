/**
 * Bateria de aceite do Copiloto (MVP-04, PRD §18): 20 perguntas, acerto > 90%.
 *
 *   pnpm eval:copilot            roda contra o modelo configurado (gasta tokens)
 *   pnpm eval:copilot --dry      só lista as perguntas e o gabarito esperado
 *   pnpm eval:copilot --only=est-01,orc-02
 *   pnpm eval:copilot --tenant=gf-distribuidora
 *
 * Códigos de saída: 0 aprovado · 1 reprovado · 2 incompleto (menos de 20 perguntas executadas).
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateText, isStepCount } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { createCopilotTools } from "@/lib/ai/tools";
import { COPILOT_MAX_STEPS, COPILOT_SYSTEM_PROMPT, copilotModel } from "@/lib/ai/copilot-config";
import { buildCases } from "./cases";
import {
  ACCEPTANCE_ACCURACY,
  ACCEPTANCE_QUESTIONS,
  acceptanceVerdict,
  evaluateCase,
  summarize,
  type Check,
  type CaseOutcome,
  type EvalCase,
  type RunResult,
} from "./evaluate";
import { buildTruth } from "./ground-truth";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

function describeCheck(c: Check): string {
  switch (c.kind) {
    case "tool":
      return `chama ${c.anyOf.join(" ou ")}`;
    case "noTools":
      return "não chama ferramentas";
    case "toolInput":
      return `${c.tool}.${c.key} = ${c.describe}`;
    case "number":
      return `${c.label} = ${c.value}`;
    case "zero":
      return `${c.label} = zero/nenhum`;
    case "textAny":
      return `${c.label} ∈ [${c.items.join(" | ")}]`;
    case "textAll":
      return `${c.label}: ${c.items.join(", ")}`;
    case "direction":
      return `${c.label}: ${c.dir === "up" ? "alta" : "queda"}`;
    case "refusal":
      return "recusa o pedido";
  }
}

async function ask(question: string, tenantId: string): Promise<RunResult> {
  const result = await generateText({
    model: copilotModel(),
    system: COPILOT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
    tools: createCopilotTools(tenantId),
    stopWhen: isStepCount(COPILOT_MAX_STEPS),
  });
  return {
    answer: result.text,
    toolCalls: result.steps.flatMap((s) =>
      s.toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: ((tc as { input?: unknown }).input ?? {}) as Record<string, unknown>,
      }))
    ),
    toolErrors: result.steps.flatMap((s) =>
      s.content
        .filter((part) => part.type === "tool-error")
        .map((part) => {
          const e = (part as { toolName?: string; error?: unknown }).error;
          return `${(part as { toolName?: string }).toolName}: ${e instanceof Error ? e.message : String(e)}`;
        })
    ),
  };
}

function reportMarkdown(params: {
  date: string;
  model: string;
  tenant: string;
  rows: { c: EvalCase; run: RunResult | null; outcome: CaseOutcome; ms: number }[];
  skipped: { id: string; reason: string }[];
  verdict: string;
  passed: number;
  executed: number;
  infra: number;
}): string {
  const { date, model, tenant, rows, skipped, verdict, passed, executed, infra } = params;
  const pct = executed === 0 ? 0 : (passed / executed) * 100;
  const lines: string[] = [
    `# Bateria de aceite do Copiloto — ${date}`,
    "",
    `- **Resultado:** ${verdict.toUpperCase()} — ${passed}/${executed} (${pct.toFixed(0)}%). Critério: ${ACCEPTANCE_QUESTIONS} perguntas e acerto acima de ${ACCEPTANCE_ACCURACY * 100}%.`,
    ...(infra > 0
      ? [
          `- **Atenção:** ${infra} pergunta(s) descartada(s) por falha de ambiente (ferramenta lançou erro), fora da acurácia. Rode de novo.`,
        ]
      : []),
    `- **Modelo:** ${model} · **Empresa:** ${tenant}`,
    `- **Gabarito:** calculado direto do banco, sem usar as ferramentas do Copiloto.`,
    `- **Limite do método:** a checagem procura os valores na resposta; contagens pequenas podem coincidir por acaso com outro número do texto.`,
    "",
    "| # | Categoria | Pergunta | Resultado | Ferramentas |",
    "|---|---|---|---|---|",
    ...rows.map(
      ({ c, run, outcome }) =>
        `| ${c.id} | ${c.category} | ${c.question.replace(/\|/g, "/")} | ${outcome.infra ? "⚠️" : outcome.passed ? "✅" : "❌"} | ${
          run?.toolCalls.map((t) => t.toolName).join(", ") || "—"
        } |`
    ),
  ];

  const failed = rows.filter((r) => !r.outcome.passed);
  if (failed.length > 0) {
    lines.push("", "## Falhas", "");
    for (const { c, run, outcome } of failed) {
      lines.push(`### ${c.id} — ${c.question}`, "");
      for (const f of outcome.failures) lines.push(`- ${f}`);
      lines.push(
        "",
        "> " + (run?.answer.replace(/\n/g, "\n> ").slice(0, 600) || "(sem resposta)"),
        ""
      );
    }
  }

  if (skipped.length > 0) {
    lines.push("", "## Perguntas não executadas (falta de dados)", "");
    for (const s of skipped) lines.push(`- ${s.id}: ${s.reason}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const slug = option("tenant");
  const [tenant] = slug
    ? await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
    : await db.select().from(tenants).limit(1);
  if (!tenant) throw new Error("Nenhuma empresa (tenant) encontrada.");

  const truth = await buildTruth(tenant.id);
  const built = buildCases(truth);
  const only = option("only")?.split(",");
  const cases = only ? built.cases.filter((c) => only.includes(c.id)) : built.cases;

  console.log(
    `Empresa: ${tenant.name} · perguntas montadas: ${built.cases.length} · puladas: ${built.skipped.length}`
  );
  for (const s of built.skipped) console.log(`  (pulada) ${s.id}: ${s.reason}`);

  if (flag("dry")) {
    for (const c of cases) {
      console.log(`\n[${c.id}] ${c.category} — ${c.question}`);
      for (const check of c.checks) console.log(`   • ${describeCheck(check)}`);
    }
    return 0;
  }

  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const rows: { c: EvalCase; run: RunResult | null; outcome: CaseOutcome; ms: number }[] = [];
  for (const c of cases) {
    const started = Date.now();
    let run: RunResult | null = null;
    let outcome: CaseOutcome;
    try {
      run = await ask(c.question, tenant.id);
      outcome = evaluateCase(c, run, truth.skus);
    } catch (err) {
      outcome = {
        passed: false,
        failures: [
          `erro ao consultar o modelo: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }
    const ms = Date.now() - started;
    rows.push({ c, run, outcome, ms });
    const tag = outcome.infra ? "INFRA" : outcome.passed ? "OK   " : "FAIL ";
    console.log(
      `${tag}${c.id} (${ms} ms)${outcome.passed ? "" : " — " + outcome.failures.join("; ")}`
    );
  }

  const summary = summarize(rows.map((r) => r.outcome));
  const verdict = only ? "parcial" : acceptanceVerdict(summary);
  console.log(
    `\nResultado: ${summary.passed}/${summary.executed} (${(summary.accuracy * 100).toFixed(0)}%) — ${verdict.toUpperCase()}`
  );
  if (summary.infra > 0) {
    console.log(
      `${summary.infra} pergunta(s) descartada(s) por falha de ambiente (ferramenta lançou erro). Rode de novo.`
    );
  }

  if (!only) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date()
    );
    const file = path.resolve(process.cwd(), "..", "docs", "evals", `copilot-${date}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      reportMarkdown({
        date,
        model,
        tenant: tenant.name,
        rows,
        skipped: built.skipped,
        verdict,
        passed: summary.passed,
        executed: summary.executed,
        infra: summary.infra,
      })
    );
    console.log(`Relatório: ${file}`);
  }

  if (verdict === "parcial") return summary.passed === summary.executed ? 0 : 1;
  if (verdict === "aprovado") return 0;
  return verdict === "reprovado" ? 1 : 2;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(3);
  });
