/**
 * Ferramentas do Copiloto contra Postgres real, sem chamar o modelo. Só roda com RUN_DB_TESTS=1.
 *
 *   RUN_DB_TESTS=1 pnpm exec vitest run src/lib/ai/tools.integration.test.ts
 *
 * O gabarito vem de `buildTruth` (SQL direto, independente das ferramentas). Somente leitura.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, quoteItems, quotes, tenants } from "@/lib/db/schema";
import { createCopilotTools } from "./tools";
import { buildTruth } from "./eval/ground-truth";
import type { Truth } from "./eval/truth";

const enabled = !!process.env.RUN_DB_TESTS;
const TAG = `impact-${Date.now()}`;

type Executable = { execute: (input: never, options: never) => Promise<unknown> };

describe.skipIf(!enabled)("ferramentas do Copiloto (Postgres real)", () => {
  let tenantId = "";
  let truth: Truth;
  let tools: ReturnType<typeof createCopilotTools>;

  const run = async <T = Record<string, any>>(name: keyof typeof tools, input: object) =>
    (await (tools[name] as unknown as Executable).execute(
      input as never,
      { toolCallId: "t", messages: [] } as never
    )) as T;

  beforeAll(async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    tenantId = tenant.id;
    truth = await buildTruth(tenantId);
    tools = createCopilotTools(tenantId);
  });

  // O teste de impacto cria propostas próprias; limpa tudo ao final.
  const createdQuoteIds: string[] = [];
  afterAll(async () => {
    if (!enabled || !createdQuoteIds.length) return;
    await db.delete(quoteItems).where(inArray(quoteItems.quoteId, createdQuoteIds));
    await db.delete(quotes).where(inArray(quotes.id, createdQuoteIds));
  });

  it("só existem ferramentas de consulta e cálculo (nenhuma grava dados)", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "calcular_impacto_aumento_insumo",
      "consultar_cotacao_mercado",
      "consultar_lead_time_fornecedores",
      "consultar_orcamentos_pendentes",
      "consultar_retalhos_disponiveis",
      "consultar_ruptura_estoque",
    ]);
  });

  it("ruptura: totais batem com o banco e a lista vem da menor cobertura", async () => {
    const r = await run("consultar_ruptura_estoque", { limite: 100 });
    const critical = truth.risk.filter((s) => s.status === "CRITICAL_RUPTURE").length;
    expect(r.totais.criticos).toBe(critical);
    expect(r.totais.emRisco).toBe(truth.risk.length);
    expect(r.items.map((i: { sku: string }) => i.sku).sort()).toEqual(
      truth.risk.map((s) => s.sku).sort()
    );
    const coverage = r.items.map((i: { diasCobertura: number }) => i.diasCobertura);
    expect(coverage).toEqual([...coverage].sort((a, b) => a - b));
  });

  it("ruptura: filtro por status e por SKU", async () => {
    const onlyCritical = await run("consultar_ruptura_estoque", { status: "CRITICAL_RUPTURE" });
    expect(
      onlyCritical.items.every((i: { status: string }) => i.status === "CRITICAL_RUPTURE")
    ).toBe(true);

    if (truth.risk.length) {
      const sku = truth.risk[0].sku;
      const one = await run("consultar_ruptura_estoque", { sku });
      expect(one.items.map((i: { sku: string }) => i.sku)).toContain(sku);
    }
  });

  it("cotação: último fechamento igual ao do banco e ativo desconhecido lista os válidos", async () => {
    const ptax = await run("consultar_cotacao_mercado", { ativo: "USD_BRL", dias: 15 });
    expect(ptax.ultimoFechamento).toBe(truth.market.ptax.last);

    const unknown = await run("consultar_cotacao_mercado", { ativo: "OURO", dias: 15 });
    expect(unknown.error).toBeTruthy();
    expect(unknown.simbolosValidos.length).toBeGreaterThan(0);
  });

  it("orçamentos: contagem total e por status batem com o banco", async () => {
    const all = await run("consultar_orcamentos_pendentes", {});
    expect(all.count).toBe(truth.quotes.totalCount);

    const approved = await run("consultar_orcamentos_pendentes", { status: "aprovado" });
    expect(approved.count).toBe(truth.quotes.approvedCount);
    expect(approved.items.every((i: { status: string }) => i.status === "aprovado")).toBe(true);
  });

  it("orçamentos: vendedor inexistente não devolve a lista inteira", async () => {
    const r = await run("consultar_orcamentos_pendentes", { vendedor: "zzz-ninguem-zzz" });
    expect(r.error).toMatch(/Vendedor não encontrado/);
    expect(r.items).toBeUndefined();
  });

  it("retalhos: só os disponíveis, na mesma quantidade do banco", async () => {
    const r = await run("consultar_retalhos_disponiveis", {});
    expect(r.count).toBe(Math.min(truth.remnants.availableCount, 50));
  });

  it("fornecedores: o primeiro tem o menor lead time", async () => {
    if (!truth.suppliers) return;
    const r = await run("consultar_lead_time_fornecedores", {});
    expect(r.items[0].leadTimeDias).toBe(truth.suppliers.minLeadTimeDays);
  });

  it("isolamento: outra empresa não enxerga nenhum dado", async () => {
    const other = createCopilotTools("00000000-0000-4000-8000-000000000000");
    const exec = async (name: keyof typeof other, input: object) =>
      (await (other[name] as unknown as Executable).execute(
        input as never,
        { toolCallId: "t", messages: [] } as never
      )) as Record<string, any>;

    expect((await exec("consultar_ruptura_estoque", {})).count).toBe(0);
    expect((await exec("consultar_orcamentos_pendentes", {})).count).toBe(0);
    expect((await exec("consultar_retalhos_disponiveis", {})).count).toBe(0);
    expect((await exec("consultar_lead_time_fornecedores", {})).count).toBe(0);
  });

  it("impacto de insumo: só propostas com itens da família pedida entram (decisão do PI)", async () => {
    // Duas famílias distintas entre os produtos ativos do tenant.
    const prodRows = await db
      .select({ id: products.id, family: products.family })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.status, "ativo")));
    const families = [...new Set(prodRows.map((p) => p.family))];
    if (families.length < 2) throw new Error("Precisa de 2 famílias de produto para este teste.");
    const famA = families[0];
    const famB = families[1];
    const prodA = prodRows.find((p) => p.family === famA)!;
    const prodB = prodRows.find((p) => p.family === famB)!;

    // Template de orçamento/item existentes, como no order-flow.
    const [templateItem] = await db.select().from(quoteItems).limit(1);
    const [templateQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, templateItem.quoteId))
      .limit(1);

    const newQuote = async (family: string, productId: string, total: number, status: string) => {
      const { id: _id, quoteNumber: _n, ...header } = templateQuote;
      const [q] = await db
        .insert(quotes)
        .values({ ...header, status, totalAmount: String(total), notes: TAG, pdfFileKey: null })
        .returning();
      createdQuoteIds.push(q.id);
      const { id: _itemId, ...item } = templateItem;
      await db.insert(quoteItems).values({ ...item, quoteId: q.id, productId, remnantId: null });
      return q;
    };

    const impact = (f: string) =>
      run<{
        valorPropostasAbertas: number;
        impactoPropostas: number;
      }>("calcular_impacto_aumento_insumo", { percentual_alta: 10, familia_produto: f });

    // Baseline antes de criar as propostas de teste.
    const a0 = await impact(famA);
    const b0 = await impact(famB);

    await newQuote(famA, prodA.id, 1000, "enviado");
    await newQuote(famB, prodB.id, 400, "enviado");

    const a1 = await impact(famA);
    const b1 = await impact(famB);

    // A proposta da família A só entra no cálculo da família A — e idem para B.
    expect(a1.valorPropostasAbertas - a0.valorPropostasAbertas).toBe(1000);
    expect(b1.valorPropostasAbertas - b0.valorPropostasAbertas).toBe(400);
    expect(a1.impactoPropostas - a0.impactoPropostas).toBe(100);
    expect(b1.impactoPropostas - b0.impactoPropostas).toBe(40);

    // Proposta encerrada não entra em nenhuma família.
    await newQuote(famA, prodA.id, 999, "perdido");
    const a2 = await impact(famA);
    expect(a2.valorPropostasAbertas).toBe(a1.valorPropostasAbertas);
  }, 60_000);
});
