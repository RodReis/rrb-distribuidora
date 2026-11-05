import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { newsApiError } from "@/lib/market/news-api";
import { addSource, listSources } from "@/lib/market/news-service";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  sourceUrl: z.string().trim().min(1).max(2000),
  licenseReference: z.string().trim().min(1).max(2000),
  retentionPolicy: z.string().trim().min(1).max(2000),
});

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.news.manage"))
    return NextResponse.json(
      { error: "Permissão market.news.manage necessária." },
      { status: 403 }
    );
  return NextResponse.json({ sources: await listSources(guard.user.tenantId) });
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
    const source = await addSource({
      tenantId: guard.user.tenantId,
      actorId: guard.user.id,
      ...parsed.data,
    });
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    return newsApiError(error);
  }
}
