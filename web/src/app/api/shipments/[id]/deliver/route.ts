import { NextResponse } from "next/server";
import { z } from "zod";
import { guardLogistics, logisticsErrorResponse, LogisticsError } from "@/lib/logistics/api";
import { deliverShipment } from "@/lib/logistics/service";

const schema = z.object({
  occurredAt: z.coerce.date(),
  evidenceRef: z.string().trim().max(500).optional(),
});
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardLogistics("logistics.dispatch");
  if (guard.error) return guard.error;
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new LogisticsError("Expedição inválida.");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new LogisticsError("Entrega inválida.");
    return NextResponse.json({ data: await deliverShipment(guard.user, id, parsed.data) });
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
