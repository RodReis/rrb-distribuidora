import { NextResponse } from "next/server";
import { guardMarket } from "@/lib/market/api-auth";
import { parityInputSchema } from "@/lib/market/parity-schema";
import { calculateParity } from "@/lib/market/parity-calculator";

export async function POST(request: Request) {
  const guard = await guardMarket("write");
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = parityInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parâmetros inválidos.", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  return NextResponse.json({ result: calculateParity(parsed.data) });
}
