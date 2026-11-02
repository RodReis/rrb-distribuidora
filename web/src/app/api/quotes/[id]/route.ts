import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { quoteInputSchema } from "@/lib/quotes/schemas";
import { getQuote, updateQuote } from "@/lib/quotes/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  const { id } = await params;
  const quote = await getQuote(guard.user.tenantId, id);
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardQuotes("write");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = quoteInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados do orçamento inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const quote = await updateQuote(id, {
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      payload: parsed.data,
    });

    return NextResponse.json({ quote });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
