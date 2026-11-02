/**
 * Contratos de validação (Zod) — MVP-03.
 *
 * O cliente envia apenas dimensões e intenções comerciais; todo valor
 * calculado (peso, custo, preço, margem) é recalculado no servidor.
 */

import { z } from "zod";
import { CUT_PROCESSES, GEOMETRY_TYPES } from "@/lib/metallurgy/weight-formulas";
import { QUOTE_CHANNELS, QUOTE_STATUSES } from "./pricing";

const optionalNumber = z.coerce.number().finite().nonnegative().optional().nullable();
const uuid = z.string().uuid("Identificador inválido.");

export const geometryTypeSchema = z.enum(GEOMETRY_TYPES);
export const cutProcessSchema = z.enum(CUT_PROCESSES);
export const quoteChannelSchema = z.enum(QUOTE_CHANNELS);

export const geometrySchema = z.object({
  geometryType: geometryTypeSchema,
  thicknessMm: optionalNumber,
  widthMm: optionalNumber,
  lengthMm: optionalNumber,
  diameterMm: optionalNumber,
  innerDiameterMm: optionalNumber,
  wallMm: optionalNumber,
  weightPerUnitKg: optionalNumber,
  densityGCm3: optionalNumber,
  kerfMm: optionalNumber,
  quantity: z.coerce.number().int().positive().default(1),
});

export type GeometryPayload = z.infer<typeof geometrySchema>;

export const quoteItemSchema = z.object({
  productId: uuid,
  remnantId: uuid.optional().nullable(),
  geometryType: geometryTypeSchema,
  thicknessMm: optionalNumber,
  widthMm: optionalNumber,
  lengthMm: optionalNumber,
  diameterMm: optionalNumber,
  innerDiameterMm: optionalNumber,
  wallMm: optionalNumber,
  quantity: z.coerce.number().int().positive("Quantidade deve ser maior que zero."),
  processType: cutProcessSchema.optional().nullable(),
  machineId: uuid.optional().nullable(),
  setupMinutes: z.coerce.number().nonnegative().default(0),
  /** Preço unitário informado manualmente pelo vendedor (opcional). */
  manualUnitPrice: z.coerce.number().nonnegative().optional().nullable(),
});

export type QuoteItemPayload = z.infer<typeof quoteItemSchema>;

export const quoteInputSchema = z.object({
  id: uuid.optional(),
  customerId: uuid,
  channel: quoteChannelSchema.default("whatsapp"),
  targetMarginPct: z.coerce.number().min(0).max(95).default(24),
  discountPct: z.coerce.number().min(0).max(90).default(0),
  freightCost: z.coerce.number().nonnegative().default(0),
  servicesCost: z.coerce.number().nonnegative().default(0),
  paymentTerms: z.string().trim().max(100).optional().nullable(),
  deliveryMethod: z.string().trim().max(100).optional().nullable(),
  deliveryDeadline: z.string().datetime().optional().nullable(),
  bankingInfo: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(quoteItemSchema).min(1, "Inclua ao menos um item no orçamento."),
});

export type QuoteInputPayload = z.infer<typeof quoteInputSchema>;

/** Pré-visualização: mesmo contrato de itens, sem cliente nem persistência. */
export const quotePreviewSchema = quoteInputSchema.omit({ customerId: true });

export const quoteStatusUpdateSchema = z.object({
  status: z.enum(QUOTE_STATUSES),
  lossReason: z.string().trim().max(100).optional().nullable(),
});

export const lossSchema = z.object({
  lossReason: z.string().trim().min(3, "Informe o motivo da perda.").max(100),
});

export const convertToOrderSchema = z.object({
  deliveryDeadline: z.string().datetime().optional().nullable(),
  paymentTerms: z.string().trim().max(100).optional().nullable(),
});
