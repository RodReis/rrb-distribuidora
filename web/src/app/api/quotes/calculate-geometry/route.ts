import { NextResponse } from "next/server";
import { z } from "zod";
import { guardQuotes, quotesErrorResponse } from "@/lib/quotes/api-auth";
import {
  calculateGeometry,
  calculateProcessCost,
  estimateCutTimeMinutes,
  inferDensityFromNorm,
  KERF_MM,
} from "@/lib/metallurgy/weight-formulas";
import { cutProcessSchema, geometrySchema } from "@/lib/quotes/schemas";

const bodySchema = geometrySchema.extend({
  process: cutProcessSchema.optional().nullable(),
  machineCostPerHour: z.coerce.number().nonnegative().optional().nullable(),
  setupMinutes: z.coerce.number().nonnegative().optional().nullable(),
});

export async function POST(req: Request) {
  const guard = await guardQuotes("read");
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const input = parsed.data;
    const process = input.process ?? "laser";
    const density =
      input.densityGCm3 && input.densityGCm3 > 0
        ? input.densityGCm3
        : inferDensityFromNorm(body.norm, body.family);

    const geometry = calculateGeometry({
      geometryType: input.geometryType,
      thicknessMm: input.thicknessMm,
      widthMm: input.widthMm,
      lengthMm: input.lengthMm,
      diameterMm: input.diameterMm,
      innerDiameterMm: input.innerDiameterMm,
      wallMm: input.wallMm,
      weightPerUnitKg: input.weightPerUnitKg,
      densityGCm3: density,
      kerfMm: input.kerfMm ?? KERF_MM[process],
      quantity: input.quantity,
    });

    const time = estimateCutTimeMinutes({
      process,
      cutPathTotalMm: geometry.cutPathTotalMm,
      quantity: geometry.quantity,
      thicknessMm: input.thicknessMm,
      setupMinutes: input.setupMinutes ?? 0,
    });

    return NextResponse.json({
      geometry,
      cut: {
        ...time,
        processCost: calculateProcessCost(time.totalMinutes, input.machineCostPerHour ?? 0),
      },
    });
  } catch (error) {
    return quotesErrorResponse(error);
  }
}
