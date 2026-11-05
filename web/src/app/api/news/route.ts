import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { newsApiError, parseDate } from "@/lib/market/news-api";
import { addNews, listNews } from "@/lib/market/news-service";

const schema = z.object({
  sourceId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(500),
  canonicalUrl: z.string().trim().min(1).max(2000),
  publishedAt: z.string().nullable().optional(),
  correctionOf: z.string().uuid().optional(),
  withdrawn: z.boolean().optional(),
});

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  return NextResponse.json({ items: await listNews(guard.user.tenantId) });
}

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.news.manage"))
    return NextResponse.json(
      { error: "Permissão market.news.manage necessária." },
      { status: 403 }
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const result = await addNews({
      tenantId: guard.user.tenantId,
      actorId: guard.user.id,
      ...parsed.data,
      publishedAt: parseDate(parsed.data.publishedAt),
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return newsApiError(error);
  }
}
