import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { convertToOrderSchema } from "@/lib/quotes/schemas";
import { convertQuoteToOrder } from "@/lib/quotes/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardQuotes("write");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = convertToOrderSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const order = await convertQuoteToOrder(guard.user.tenantId, guard.user.id, id, parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
