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
} from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export function createCopilotTools(tenantId: string) {
  return {
    consultar_ruptura_estoque: tool({
      description:
        "Consulta SKUs em risco de ruptura de estoque (cobertura crítica) para o tenant autenticado. Pode filtrar por família de produto.",
      inputSchema: z.object({
        familia: z
          .string()
          .optional()
          .describe("Família do produto (chapa_grossa, bobina, tubo, perfil, barra)"),
        limite: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de resultados"),
      }),
      execute: async ({ familia, limite }) => {
        const conditions = [eq(stockPredictiveMetrics.tenantId, tenantId)];
        if (familia) {
          conditions.push(eq(products.family, familia as never));
        }
        const rows = await db
          .select({
            sku: products.sku,
            description: products.commercialDescription,
            family: products.family,
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

        return {
          count: rows.length,
          items: rows.map((r) => ({
            sku: r.sku,
            descricao: r.description,
            familia: r.family,
            diasCobertura: Number(r.coverageDays),
            status: r.predictiveStatus,
            estoqueAtual: Number(r.currentStockQty),
            sugestaoCompra: Number(r.suggestedPurchaseQty),
          })),
        };
      },
    }),

    consultar_cotacao_mercado: tool({
      description: "Consulta cotação/histórico de um ativo de mercado (LME, PTAX/USD) nos últimos N dias.",
      inputSchema: z.object({
        ativo: z.string().describe("Símbodo ativo, ex: USD_BRL, LME_ALU, LME_ZINC"),
        dias: z.number().int().min(1).max(365).default(15).describe("Janela em dias"),
      }),
      execute: async ({ ativo, dias }) => {
        const [asset] = await db.select().from(marketAssets).where(eq(marketAssets.symbol, ativo));
        if (!asset) return { error: "Ativo não encontrado", ativo };
        const from = new Date(Date.now() - dias * 86_400_000);
        const rows = await db
          .select({ timestamp: marketPriceSeries.timestamp, close: marketPriceSeries.close })
          .from(marketPriceSeries)
          .where(and(eq(marketPriceSeries.assetId, asset.id), gte(marketPriceSeries.timestamp, from)))
          .orderBy(desc(marketPriceSeries.timestamp));
        const latest = rows[0];
        const oldest = rows[rows.length - 1];
        const variationPct =
          latest && oldest && Number(oldest.close) !== 0
            ? ((Number(latest.close) - Number(oldest.close)) / Number(oldest.close)) * 100
            : null;
        return {
          ativo: asset.symbol,
          nome: asset.name,
          unidade: asset.unit,
          dias,
          ultimoFechamento: latest ? Number(latest.close) : null,
          dataUltimo: latest ? latest.timestamp.toISOString() : null,
          fechamentoInicial: oldest ? Number(oldest.close) : null,
          variacaoPercentual: variationPct != null ? Number(variationPct.toFixed(2)) : null,
          pontos: rows.length,
        };
      },
    }),

    consultar_orcamentos_pendentes: tool({
      description: "Consulta orçamentos/propostas por status e vendedor.",
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
        let sellerId: string | undefined;
        if (vendedor) {
          const [u] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), sql`lower(${users.name}) like ${"%" + vendedor.toLowerCase() + "%"}`));
          if (u) sellerId = u.id;
        }
        if (sellerId) conditions.push(eq(quotes.sellerId, sellerId));
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
        const total = rows.reduce((acc, r) => acc + Number(r.totalAmount), 0);
        const avgMargin =
          rows.length > 0
            ? rows.reduce((acc, r) => acc + Number(r.grossMarginPct), 0) / rows.length
            : 0;
        return {
          count: rows.length,
          totalAmount: Number(total.toFixed(2)),
          avgMarginPct: Number(avgMargin.toFixed(2)),
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
      description: "Consulta retalhos (offcuts) disponíveis filtrando por espessura e liga.",
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

    calcular_impacto_aumento_insumo: tool({
      description:
        "Calcula o impacto financeiro de um aumento de insumo (metal) sobre uma família de produtos, com base no estoque e propostas abertas.",
      inputSchema: z.object({
        percentual_alta: z.number().describe("Percentual de alta do insumo (ex: 5 para 5%)"),
        familia_produto: z.string().describe("Família de produto afetada"),
      }),
      execute: async ({ percentual_alta, familia_produto }) => {
        const [agg] = await db
          .select({
            stockValue: sql<string>`coalesce(sum(${stockPredictiveMetrics.currentStockQty}::numeric * ${products.replacementCostBase}::numeric),0)`,
            openQuotesValue: sql<string>`coalesce((select sum(${quotes.totalAmount}::numeric) from ${quotes} where ${quotes.tenantId} = ${tenantId} and ${quotes.status} in ('enviado','em_negociacao','bloqueado_margem')),0)`,
          })
          .from(stockPredictiveMetrics)
          .innerJoin(products, eq(products.id, stockPredictiveMetrics.productId))
          .where(and(eq(stockPredictiveMetrics.tenantId, tenantId), eq(products.family, familia_produto as never)));

        const stockValue = Number(agg?.stockValue ?? 0);
        const openQuotesValue = Number(agg?.openQuotesValue ?? 0);
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
        };
      },
    }),
  };
}