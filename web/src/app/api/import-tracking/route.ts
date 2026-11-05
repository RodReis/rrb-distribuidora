import { NextResponse } from "next/server";
import { z } from "zod";
import { guardLogistics, logisticsErrorResponse, LogisticsError } from "@/lib/logistics/api";
import { addImportMilestone, listImportTracking } from "@/lib/logistics/service";

const schema = z.object({
  purchaseOrderId: z.string().uuid(),
  reference: z.string().trim().min(1).max(500),
  milestone: z.string().trim().min(1).max(80),
  observedAt: z.coerce.date(),
  eta: z.coerce.date().optional(),
});
export async function GET() {
  const guard = await guardLogistics("logistics.track");
  if (guard.error) return guard.error;
  try {
    return NextResponse.json({ data: await listImportTracking(guard.user.tenantId) });
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const guard = await guardLogistics("logistics.track");
  if (guard.error) return guard.error;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new LogisticsError("Marco de importação inválido.");
    return NextResponse.json(
      { data: await addImportMilestone(guard.user, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
