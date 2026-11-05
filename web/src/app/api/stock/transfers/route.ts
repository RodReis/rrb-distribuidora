import { NextResponse } from "next/server";
import { z } from "zod";
import { guardStock, stockErrorResponse } from "@/lib/stock/api-auth";
import { transferStock } from "@/lib/stock/transfers";

const transferSchema = z.object({
  requestKey: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  items: z
    .array(z.object({ lotId: z.string().uuid(), quantity: z.number().finite().positive() }))
    .min(1),
});

export async function POST(request: Request) {
  const guard = await guardStock("write");
  if (guard.error) return guard.error;
  try {
    const input = transferSchema.parse(await request.json());
    const transfer = await transferStock({
      ...input,
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
    });
    return NextResponse.json({ data: transfer }, { status: 201 });
  } catch (error) {
    return stockErrorResponse(error);
  }
}
