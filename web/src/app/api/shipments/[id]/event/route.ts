import { NextResponse } from "next/server";
import { z } from "zod";
import { guardLogistics, logisticsErrorResponse, LogisticsError } from "@/lib/logistics/api";
import { addShipmentEvent } from "@/lib/logistics/service";

const schema = z.object({
  type: z.string().trim().min(1).max(40),
  occurredAt: z.coerce.date(),
  location: z.string().trim().max(500).optional(),
  evidenceRef: z.string().trim().max(500).optional(),
  eta: z.coerce.date().optional(),
});
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardLogistics("logistics.track");
  if (guard.error) return guard.error;
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new LogisticsError("Expedição inválida.");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new LogisticsError("Evento inválido.");
    return NextResponse.json(
      { data: await addShipmentEvent(guard.user, id, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
