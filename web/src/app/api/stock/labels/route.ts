import { NextResponse } from "next/server";
import { z } from "zod";
import { guardStock, stockErrorResponse } from "@/lib/stock/api-auth";
import { issueStockLabel } from "@/lib/stock/labels";

const schema = z.object({ objectType: z.enum(["lote", "retalho"]), objectId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await guardStock("write");
  if (guard.error) return guard.error;
  try {
    const input = schema.parse(await request.json());
    const label = await issueStockLabel({ ...input, tenantId: guard.user.tenantId, userId: guard.user.id });
    return NextResponse.json({ data: label }, { status: 201 });
  } catch (error) {
    return stockErrorResponse(error);
  }
}
