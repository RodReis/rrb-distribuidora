import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  products,
  stockPredictiveMetrics,
  marketAssets,
  marketPriceSeries,
  quotes,
  users,
  stockRemnants,
  stockLots,
  suppliers,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import { resolveAssetSymbol } from "./asset-alias";
import { valueAtCostPerKg } from "@/lib/stock/units";

export function createCopilotTools(tenantId: string) {
  return {
    consultar_ruptura_estoque: tool({
      description:
        "Consulta SKUs com risco de ruptura de estoque. Devolve dois grupos juntos, cada item com o campo `status`: CRITICAL_RUPTURE (cobertura abaixo do lead time) e WARNING (em atenção, perto do ponto de pedido). Filtros opcionais: família e status. \"Risco de ruptura\" sem qualificação inclui os dois grupos: NÃO use `status` nesse caso. Use `status` só quando o usuário pedir explicitamente apenas os críticos (ruptura crítica) ou apenas os em atenção. O resultado traz `totais` (críticos, em atenção e `emRisco` = soma dos dois, já na família pedida): para \"quantos SKUs\" responda com esses totais, não com o tamanho da lista. Cada item traz `sugestaoCompra`: quanto comprar para evitar a ruptura. Dá para filtrar por `sku`. As quantidades vêm na unidade do produto (campo `unidade`).",
      inputSchema: z.object({
        sku: z.string().optional().describe("SKU (ou trecho do SKU) para consultar um produto específico"),
        familia: z
          .string()
          .optional()
          .describe("Família do produto (chapa_grossa, bobina, tubo, perfil, barra)"),
        status: z
          .enum(["CRITICAL_RUPTURE", "WARNING"])
          .optional()
          .describe("CRITICAL_RUPTURE = só críticos; WARNING = só em atenção; omitido = os dois"),
        limite: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de resultados"),
      }),
      execute: async ({ sku, familia, status, limite }) => {
        const conditions = [eq(stockPredictiveMetrics.tenantId, tenantId)];
        if (familia) {
          conditions.push(eq(products.family, familia as never));
        }
        if (sku) {
          conditions.push(sql`upper(${products.sku}) like ${"%" + sku.trim().toUpperCase() + "%"}`);
        }
        if (status) {
          conditions.push(eq(stockPredictiveMetrics.predictiveStatus, status));
        }
        const rows = await db
          .select({
            sku: products.sku,
            description: products.commercialDescription,
            family: products.family,
            unit: products.unit,
            coverageDays: stockPredictiveMetrics.coverageDays,
            predictiveStatus: stockPredictiveMetrics.predictiveStatus,
            currentStockQty: stockPredictiveMetrics.currentStockQty,
            suggestedPurchaseQty: stockPredictiveMetrics.suggestedPurchaseQty,
          })
          .from(stockPredictiveMetrics)
          .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
          .where(
            and(
              ...conditions,
              sql`${stockPredictiveMetrics.predictiveStatus} IN ('CRITICAL_RUPTURE','WARNING')`
            )
          )
          .orderBy(stockPredictiveMetrics.coverageDays)
          .limit(limite ?? 20);

        // Totais reais do grupo (mesma família), sem o filtro de status e sem o limite da lista.
        const totalConditions = [eq(stockPredictiveMetrics.tenantId, tenantId)];
        if (familia) totalConditions.push(eq(products.family, familia as never));
        const totalRows = await db
          .select({
            status: stockPredictiveMetrics.predictiveStatus,
            n: sql<number>`count(*)`,
          })
          .from(stockPredictiveMetrics)
          .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
          .where(
            and(
              ...totalConditions,
              sql`${stockPredictiveMetrics.predictiveStatus} IN ('CRITICAL_RUPTURE','WARNING')`
            )
          )
          .groupBy(stockPredictiveMetrics.predictiveStatus);
        const criticos = Number(totalRows.find((r) => r.status === "CRITICAL_RUPTURE")?.n ?? 0);
        const emAtencao = Number(totalRows.find((r) => r.status === "WARNING")?.n ?? 0);

        return {
          count: rows.length,
          totais: { criticos, emAtencao, emRisco: criticos + emAtencao },
          items: rows.map((r) => ({
            sku: r.sku,
            descricao: r.description,
            familia: r.family,
            unidade: r.unit,
            diasCobertura: Number(r.coverageDays),
            status: r.predictiveStatus,
            estoqueAtual: Number(r.currentStockQty),
            sugestaoCompra: Number(r.suggestedPurchaseQty),
          })),
        };
      },
    }),

    consultar_cotacao_mercado: tool({
      description:
        "Consulta a cotação de um ativo de mercado (dólar PTAX, alumínio LME, HRC). Sempre devolve o último fechamento disponível e a data dele; com a janela em dias devolve também a variação percentual no período. Serve para 'qual o último fechamento' e para 'quanto variou em N dias'.",
      inputSchema: z.object({
        ativo: z
          .string()
          .describe(`Símbolo do ativo. Valores válidos: ${Object.values(ASSET_SYMBOLS).join(", ")}`),
        dias: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(15)
          .describe("Janela da variação, em dias corridos (ex.: 7 para uma semana, 30 para um mês)"),
      }),
      execute: async ({ ativo, dias }) => {
        const symbol = resolveAssetSymbol(ativo);
        const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, symbol));
        if (!asset) {
          return { error: "Ativo não encontrado", ativo, simbolosValidos: Object.values(ASSET_SYMBOLS) };
        }
        const from = new Date(Date.now() - dias * 86_400_000);
        const rows = await db
          .select({ timestamp: marketPriceSeries.timestamp, close: marketPriceSeries.close })
          .from(marketPriceSeries)
          .where(and(eq(marketPriceSeries.assetId, asset.id), gte(marketPriceSeries.timestamp, from)))
          .orderBy(desc(marketPriceSeries.timestamp));
        // O último fechamento não depende da janela: fim de semana e feriado não podem zerá-lo.
        const [latestOverall] = await db
          .select({ timestamp: marketPriceSeries.timestamp, close: marketPriceSeries.close })
          .from(marketPriceSeries)
          .where(eq(marketPriceSeries.assetId, asset.id))
          .orderBy(desc(marketPriceSeries.timestamp))
          .limit(1);
        const latest = rows[0];
        const oldest = rows[rows.length - 1];
        // Com menos de 2 pontos na janela não existe variação: 0% seria informação falsa.
        const variationPct =
          rows.length >= 2 && Number(oldest.close) !== 0
            ? ((Number(latest.close) - Number(oldest.close)) / Number(oldest.close)) * 100
            : null;
        return {
          ativo: asset.symbol,
          nome: asset.name,
          unidade: asset.unit,
          dias,
          ultimoFechamento: latestOverall ? Number(latestOverall.close) : null,
          dataUltimo: latestOverall ? latestOverall.timestamp.toISOString() : null,
          fechamentoInicial: rows.length >= 2 ? Number(oldest.close) : null,
          variacaoPercentual: variationPct != null ? Number(variationPct.toFixed(2)) : null,
          pontosNaJanela: rows.length,
        };
      },
    }),

    consultar_orcamentos_pendentes: tool({
      description:
        "Consulta orçamentos/propostas, com filtros opcionais de status e vendedor. Devolve a quantidade, o valor total, a margem média e a lista (até 50). Serve para contar orçamentos, somar valores e calcular a margem média por status (aprovado, enviado, bloqueado_margem...) ou por vendedor. Sem filtros, considera todos.",
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe("Status: rascunho, bloqueado_margem, enviado, em_negociacao, aprovado, perdido, expirado"),
        vendedor: z.string().optional().describe("Nome ou email do vendedor"),
      }),
      execute: async ({ status, vendedor }) => {
        const conditions = [eq(quotes.tenantId, tenantId)];
        if (status) conditions.push(eq(quotes.status, status));
        if (vendedor) {
          const term = "%" + vendedor.toLowerCase() + "%";
          const sellers = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.tenantId, tenantId),
                sql`(lower(${users.name}) like ${term} or lower(${users.email}) like ${term})`
              )
            );
          if (sellers.length === 0) {
            return { error: "Vendedor não encontrado", vendedor };
          }
          conditions.push(inArray(quotes.sellerId, sellers.map((s) => s.id)));
        }

        const [agg] = await db
          .select({
            count: sql<number>`count(*)`,
            total: sql<string>`coalesce(sum(${quotes.totalAmount}::numeric),0)`,
            avgMargin: sql<string>`coalesce(avg(${quotes.grossMarginPct}::numeric),0)`,
          })
          .from(quotes)
          .where(and(...conditions));

        const rows = await db
          .select({
            quoteNumber: quotes.quoteNumber,
            status: quotes.status,
            totalAmount: quotes.totalAmount,
            grossMarginPct: quotes.grossMarginPct,
            createdAt: quotes.createdAt,
            sellerName: users.name,
          })
          .from(quotes)
          .leftJoin(users, eq(users.id, quotes.sellerId))
          .where(and(...conditions))
          .orderBy(desc(quotes.createdAt))
          .limit(50);
        return {
          count: Number(agg?.count ?? 0),
          totalAmount: Number(Number(agg?.total ?? 0).toFixed(2)),
          avgMarginPct: Number(Number(agg?.avgMargin ?? 0).toFixed(2)),
          itensListados: rows.length,
          items: rows.map((r) => ({
            numero: r.quoteNumber,
            status: r.status,
            valor: Number(r.totalAmount),
            margemPct: Number(r.grossMarginPct),
            vendedor: r.sellerName,
            criadoEm: r.createdAt.toISOString(),
          })),
        };
      },
    }),

    consultar_retalhos_disponiveis: tool({
      description:
        "Consulta retalhos (offcuts) disponíveis. Todos os filtros são opcionais (espessura mínima/máxima e liga); sem filtros lista todos os retalhos disponíveis. Serve para contar retalhos e para achar sobras por espessura.",
      inputSchema: z.object({
        espessura_min: z.number().optional().describe("Espessura mínima em mm"),
        espessura_max: z.number().optional().describe("Espessura máxima em mm"),
        liga: z.string().optional().describe("Liga/norma (ex: A36, A572)"),
      }),
      execute: async ({ espessura_min, espessura_max, liga }) => {
        const conditions = [eq(stockRemnants.tenantId, tenantId), eq(stockRemnants.status, "disponivel")];
        if (espessura_min != null) conditions.push(gte(stockRemnants.thicknessMm, String(espessura_min)));
        if (espessura_max != null) conditions.push(lte(stockRemnants.thicknessMm, String(espessura_max)));
        const rows = await db
          .select({
            code: stockRemnants.code,
            thicknessMm: stockRemnants.thicknessMm,
            widthMm: stockRemnants.widthMm,
            lengthMm: stockRemnants.lengthMm,
            weightKg: stockRemnants.weightKg,
            locationAddress: stockRemnants.locationAddress,
            productName: products.commercialDescription,
            norm: products.norm,
          })
          .from(stockRemnants)
          .innerJoin(products, eq(products.id, stockRemnants.productId))
          .where(and(...conditions))
          .limit(50);
        const filtered = liga
          ? rows.filter((r) => r.norm?.toLowerCase().includes(liga.toLowerCase()))
          : rows;
        return {
          count: filtered.length,
          items: filtered.map((r) => ({
            codigo: r.code,
            produto: r.productName,
            norma: r.norm,
            espessuraMm: Number(r.thicknessMm),
            larguraMm: r.widthMm != null ? Number(r.widthMm) : null,
            comprimentoMm: r.lengthMm != null ? Number(r.lengthMm) : null,
            pesoKg: Number(r.weightKg),
            localizacao: r.locationAddress,
          })),
        };
      },
    }),

    consultar_lead_time_fornecedores: tool({
      description:
        "Lista fornecedores ativos ordenados pelo menor lead time (dias). Pode filtrar por produto (SKU ou trecho da descrição), considerando os fornecedores dos lotes desse produto.",
      inputSchema: z.object({
        produto: z
          .string()
          .optional()
          .describe("SKU ou trecho da descrição do produto (ex: chapa 1/4, CG-A36)"),
        limite: z.number().int().min(1).max(50).default(10).describe("Quantidade máxima de resultados"),
      }),
      execute: async ({ produto, limite }) => {
        if (produto) {
          const term = "%" + produto.toLowerCase() + "%";
          const rows = await db
            .selectDistinct({
              fornecedor: suppliers.legalName,
              fantasia: suppliers.tradeName,
              leadTimeDias: suppliers.leadTimeDays,
              sku: products.sku,
              produto: products.commercialDescription,
            })
            .from(stockLots)
            .innerJoin(suppliers, eq(suppliers.id, stockLots.supplierId))
            .innerJoin(products, eq(products.id, stockLots.productId))
            .where(
              and(
                eq(stockLots.tenantId, tenantId),
                eq(suppliers.active, true),
                sql`(lower(${products.sku}) like ${term} or lower(${products.commercialDescription}) like ${term})`
              )
            )
            .orderBy(suppliers.leadTimeDays)
            .limit(limite ?? 10);
          return {
            filtro: produto,
            base: "fornecedores dos lotes já recebidos do produto",
            count: rows.length,
            items: rows,
          };
        }
        const rows = await db
          .select({
            fornecedor: suppliers.legalName,
            fantasia: suppliers.tradeName,
            leadTimeDias: suppliers.leadTimeDays,
          })
          .from(suppliers)
          .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.active, true)))
          .orderBy(suppliers.leadTimeDays)
          .limit(limite ?? 10);
        return { filtro: null, base: "lead time padrão do cadastro", count: rows.length, items: rows };
      },
    }),

    calcular_impacto_aumento_insumo: tool({
      description:
        "Calcula o impacto financeiro de um aumento de insumo (metal) sobre uma família de produtos, com base no estoque e propostas abertas.",
      inputSchema: z.object({
        percentual_alta: z.number().describe("Percentual de alta do insumo (ex: 5 para 5%)"),
        familia_produto: z.string().describe("Família de produto afetada"),
      }),
      execute: async ({ percentual_alta, familia_produto }) => {
        const stockRows = await db
          .select({
            qty: stockPredictiveMetrics.currentStockQty,
            cost: products.replacementCostBase,
            unit: products.unit,
            family: products.family,
            weightPerUnit: products.weightPerUnit,
            thicknessMm: products.thicknessMm,
            widthMm: products.widthMm,
            lengthMm: products.lengthMm,
            diameterMm: products.diameterMm,
            wallMm: products.wallMm,
            densityGCm3: products.densityGCm3,
          })
          .from(stockPredictiveMetrics)
          .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
          .where(and(eq(stockPredictiveMetrics.tenantId, tenantId), eq(products.family, familia_produto as never)));

        const [open] = await db
          .select({
            total: sql<string>`coalesce(sum(${quotes.totalAmount}::numeric),0)`,
          })
          .from(quotes)
          .where(
            and(
              eq(quotes.tenantId, tenantId),
              inArray(quotes.status, ["enviado", "em_negociacao", "bloqueado_margem"])
            )
          );

        // Saldo em unidade de estoque → kg × R$/kg. Produto sem conversão conhecida fica de fora e é avisado.
        let stockValue = 0;
        let semConversao = 0;
        for (const row of stockRows) {
          const value = valueAtCostPerKg(row.qty, row.cost, row);
          if (value === null) semConversao += 1;
          else stockValue += value;
        }
        const openQuotesValue = Number(open?.total ?? 0);
        const impactStock = stockValue * (percentual_alta / 100);
        const impactQuotes = openQuotesValue * (percentual_alta / 100);
        return {
          familia: familia_produto,
          percentualAlta: percentual_alta,
          valorEstoqueAtual: Number(stockValue.toFixed(2)),
          valorPropostasAbertas: Number(openQuotesValue.toFixed(2)),
          impactoEstoque: Number(impactStock.toFixed(2)),
          impactoPropostas: Number(impactQuotes.toFixed(2)),
          impactoTotal: Number((impactStock + impactQuotes).toFixed(2)),
          ...(semConversao > 0 ? { produtosSemConversaoDeUnidade: semConversao } : {}),
        };
      },
    }),
  };
}