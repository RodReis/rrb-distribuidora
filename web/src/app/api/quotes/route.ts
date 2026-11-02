import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { quoteInputSchema } from "@/lib/quotes/schemas";
import { createQuote, listQuotes } from "@/lib/quotes/service";

export async function GET(req: Request) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const result = await listQuotes(guard.user.tenantId, {
    status: searchParams.get("status") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    search: searchParams.get("q") ?? undefined,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("pageSize") ?? 20),
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const guard = await guardQuotes("write");
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const parsed = quoteInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados do orçamento inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const quote = await createQuote({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      payload: parsed.data,
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
