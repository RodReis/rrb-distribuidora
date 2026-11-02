import { NextResponse } from "next/server";
import { guardMarginApproval, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { approveQuoteMargin } from "@/lib/quotes/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardMarginApproval();
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const quote = await approveQuoteMargin(guard.user.tenantId, guard.user.id, id);
    return NextResponse.json({ quote });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
