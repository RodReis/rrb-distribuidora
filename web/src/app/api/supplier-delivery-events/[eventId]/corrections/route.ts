import { NextResponse } from "next/server";
import { z } from "zod";
import { guardSupplier, supplierErrorResponse } from "@/lib/suppliers/api-auth";
import { correctSupplierDeliveryEvent } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

const correctionSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  eventAt: z.string().datetime(),
  promisedAt: z.string().datetime().nullable(),
  itemId: z.string().uuid().nullable(),
  quantity: z.number().positive().nullable(),
  reason: z.string().trim().min(10),
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const guard = await guardSupplier("supplier.correct_events");
  if (guard.error) return guard.error;
  const { eventId } = await params;
  const parsed = correctionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Correção inválida.", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const data = await correctSupplierDeliveryEvent({
      tenantId: guard.user.tenantId,
      userId: guard.user.id,
      role: guard.user.role,
      eventId,
      ...parsed.data,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return supplierErrorResponse(error);
  }
}
