import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMarket } from "@/lib/market/api-auth";
import { hasMarketCapability } from "@/lib/market/capabilities";
import { newsApiError, parseDate } from "@/lib/market/news-api";
import { addRegulatory, listRegulatory } from "@/lib/market/news-service";

const schema = z.object({
  authority: z.string().trim().min(1).max(160),
  actId: z.string().trim().min(1).max(160),
  jurisdiction: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(2000),
  publishedAt: z.string().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveUntil: z.string().nullable().optional(),
  status: z.enum(["publicado", "alterado", "revogado", "indeterminado"]),
  primarySourceUrl: z.string().trim().min(1).max(2000),
  supersedesId: z.string().uuid().optional(),
});

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.regulatory.read"))
    return NextResponse.json(
      { error: "Permissão market.regulatory.read necessária." },
      { status: 403 }
    );
  return NextResponse.json({ items: await listRegulatory(guard.user.tenantId) });
}

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;
  if (!hasMarketCapability(guard.user.role, "market.regulatory.manage"))
    return NextResponse.json(
      { error: "Permissão market.regulatory.manage necessária." },
      { status: 403 }
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const item = await addRegulatory({
      tenantId: guard.user.tenantId,
      actorId: guard.user.id,
      ...parsed.data,
      publishedAt: parseDate(parsed.data.publishedAt),
      effectiveFrom: parseDate(parsed.data.effectiveFrom),
      effectiveUntil: parseDate(parsed.data.effectiveUntil),
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return newsApiError(error);
  }
}
