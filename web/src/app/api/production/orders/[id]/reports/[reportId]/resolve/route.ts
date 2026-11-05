import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProduction, productionErrorResponse } from "@/lib/production/api-auth";
import { ProductionError } from "@/lib/production/errors";
import { resolveProductionReport } from "@/lib/production/service";

const bodySchema = z.object({ reason: z.string().trim().min(5).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const guard = await guardProduction("production.approve_loss");
  if (guard.error) return guard.error;
  try {
    const { id: orderId, reportId } = await params;
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) throw new ProductionError("Motivo de rejeição inválido.");
    const report = await resolveProductionReport({
      tenantId: guard.user.tenantId,
      orderId,
      reportId,
      user: guard.user,
      reason: body.data.reason,
    });
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return productionErrorResponse(error);
  }
}
