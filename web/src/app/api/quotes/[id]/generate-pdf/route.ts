import { NextResponse } from "next/server";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import { generateQuotePdf } from "@/lib/quotes/pdf/generate";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardQuotes("write");
  if (guard.error) return guard.error;

  try {
    const { id } = await params;
    const stored = await generateQuotePdf(guard.user.tenantId, id);
    return NextResponse.json({
      key: stored.key,
      url: stored.url,
      storage: stored.storage,
    });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
