import { z } from "zod";

const uuid = z.string().uuid();
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().min(0);

export const reportEnvelopeSchema = z.object({
  clientOperationId: uuid,
  deviceId: uuid,
  sequence: z.number().int().positive(),
  payloadVersion: z.number().int().positive(),
  expectedOrderVersion: z.number().int().positive(),
  operatorId: uuid,
  localOccurredAt: z.string().datetime({ offset: true }),
  operationId: uuid,
  payload: z.unknown(),
});

export const productionReportPayloadSchema = z.object({
  kind: z.literal("production"),
  orderItemId: uuid,
  completedQty: positive,
  consumptions: z
    .array(
      z.object({
        sourceType: z.enum(["lot", "remnant"]),
        sourceId: uuid,
        quantity: positive,
      })
    )
    .min(1)
    .max(30)
    .refine(
      (rows) =>
        new Set(rows.map((row) => `${row.sourceType}:${row.sourceId}`)).size === rows.length,
      { message: "Não repita a mesma origem no mesmo apontamento." }
    ),
  residuals: z
    .array(
      z
        .object({
          clientOperationId: uuid,
          consumptionIndex: z.number().int().min(0),
          thicknessMm: positive,
          widthMm: positive.optional(),
          lengthMm: positive.optional(),
          diameterMm: positive.optional(),
          measuredWeightKg: positive,
          locationAddress: z.string().trim().min(1).max(50),
          notes: z.string().trim().max(500).optional(),
        })
        .refine((row) => Boolean(row.widthMm || row.lengthMm || row.diameterMm), {
          message: "Informe ao menos uma dimensão além da espessura.",
        })
    )
    .max(30)
    .default([]),
  lossReason: z.string().trim().min(5).max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const transitionSchema = z.object({
  target: z.enum([
    "liberada",
    "em_corte",
    "pausada",
    "bloqueada_qualidade",
    "concluida",
    "cancelada",
  ]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
  cancelledItems: z
    .array(
      z.object({
        itemId: uuid,
        quantity: positive,
        reason: z.string().trim().min(5).max(500),
      })
    )
    .max(100)
    .optional(),
});

export const residualSchema = z
  .object({
    clientOperationId: uuid,
    expectedOrderVersion: z.number().int().positive(),
    reportId: uuid,
    consumptionId: uuid,
    orderItemId: uuid,
    thicknessMm: positive,
    widthMm: positive.optional(),
    lengthMm: positive.optional(),
    diameterMm: positive.optional(),
    measuredWeightKg: positive,
    locationAddress: z.string().trim().min(1).max(50),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((row) => Boolean(row.widthMm || row.lengthMm || row.diameterMm), {
    message: "Informe ao menos uma dimensão além da espessura.",
  });
