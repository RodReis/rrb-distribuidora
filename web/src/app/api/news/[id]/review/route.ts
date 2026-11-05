import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { newsApiError } from "@/lib/market/news-api";
import { reviewNews } from "@/lib/market/news-service";

const schema = z.object({
  labels: z.array(z.string().trim().min(1).max(50)).max(10),
  sentiment: z.string().trim().max(40).nullable().optional(),
  decision: z.enum(["approved", "rejected"]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.news.review"))
    return NextResponse.json(
      { error: "Permissão market.news.review necessária." },
      { status: 403 }
    );
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const review = await reviewNews({
      tenantId: guard.user.tenantId,
      actorId: guard.user.id,
      itemId: id,
      labels: parsed.data.labels,
      sentiment: parsed.data.sentiment ?? null,
      decision: parsed.data.decision,
    });
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    return newsApiError(error);
  }
}
