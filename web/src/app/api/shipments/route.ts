import { NextResponse } from "next/server";
import { z } from "zod";
import { guardLogistics, logisticsErrorResponse, LogisticsError } from "@/lib/logistics/api";
import { listShipments, prepareShipment } from "@/lib/logistics/service";

const schema = z.object({
  salesOrderId: z.string().uuid(),
  origin: z.string().trim().min(1).max(500),
  destination: z.string().trim().min(1).max(500),
  volumeCount: z.number().int().positive().max(10000),
  carrier: z.string().trim().max(200).optional(),
  plannedAt: z.coerce.date().optional(),
});

export async function GET() {
  const guard = await guardLogistics("logistics.read");
  if (guard.error) return guard.error;
  try {
    return NextResponse.json({ data: await listShipments(guard.user.tenantId) });
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardLogistics("logistics.prepare");
  if (guard.error) return guard.error;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new LogisticsError("Dados de expedição inválidos.");
    return NextResponse.json(
      { data: await prepareShipment(guard.user, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    return logisticsErrorResponse(error);
  }
}
