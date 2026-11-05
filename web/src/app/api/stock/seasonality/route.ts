import { NextResponse } from "next/server";
import { z } from "zod";
import { guardStock, stockErrorResponse } from "@/lib/stock/api-auth";
import { calculateProductSeasonality, MIN_SEASONAL_CYCLES } from "@/lib/stock/seasonality";

const schema = z.object({ productId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await guardStock("read");
  if (guard.error) return guard.error;
  try {
    const { productId } = schema.parse(await request.json());
    const data = await calculateProductSeasonality({ tenantId: guard.user.tenantId, productId });
    return NextResponse.json({ data, minimumCycles: MIN_SEASONAL_CYCLES });
  } catch (error) {
    return stockErrorResponse(error);
  }
}
