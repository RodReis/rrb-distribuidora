import { NextResponse } from "next/server";
import { guardStock } from "@/lib/stock/api-auth";
import { resolveStockLabel } from "@/lib/stock/labels";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const guard = await guardStock("read");
  if (guard.error) return guard.error;
  const { token } = await params;
  const data = await resolveStockLabel(guard.user.tenantId, token);
  if (!data) return NextResponse.json({ error: "Etiqueta inválida ou revogada." }, { status: 404 });
  return NextResponse.json({ data });
}
