import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { quotePreviewSchema } from "@/lib/quotes/schemas";
import { getTenantQuotePolicy, priceQuoteItems, serializeQuotePricing } from "@/lib/quotes/service";

/**
 * Precifica um rascunho sem persistir nada.
 *
 * O construtor de orçamentos usa esta rota para recalcular peso, custo de
 * reposição, margem e validade a cada alteração de geometria.
 */
export async function POST(req: Request) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  try {
    const parsed = quotePreviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados do orçamento inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const policy = await getTenantQuotePolicy(guard.user.tenantId);
    const payload = {
      ...parsed.data,
      targetMarginPct: parsed.data.targetMarginPct || policy.defaultMarginPct,
    };

    const pricing = await priceQuoteItems(
      {
        tenantId: guard.user.tenantId,
        targetMarginPct: payload.targetMarginPct,
        discountPct: payload.discountPct,
        minMarginPct: policy.minMarginPct,
      },
      payload
    );

    return NextResponse.json({
      preview: serializeQuotePricing(pricing, policy.minMarginPct),
      policy,
    });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
