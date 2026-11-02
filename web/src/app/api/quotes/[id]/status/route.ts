import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { quoteStatusUpdateSchema } from "@/lib/quotes/schemas";
import { changeQuoteStatus } from "@/lib/quotes/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardQuotes("write");
  if (guard.error) return guard.error;

  try {
    const parsed = quoteStatusUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Status inválido.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { id } = await params;
    const quote = await changeQuoteStatus(
      guard.user.tenantId,
      guard.user.id,
      id,
      parsed.data.status,
      parsed.data.lossReason
    );

    return NextResponse.json({ quote });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
