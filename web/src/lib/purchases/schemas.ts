import { z } from "zod";
import { PURCHASE_APPROVER_CAPABILITIES } from "./types";

/** Validação de entrada das rotas de compras (server-side, antes do serviço). */

const money = z.number().finite().min(0);
const positiveMoney = z.number().finite().positive();

export const purchaseAdditionalCostSchema = z.object({
  description: z.string().trim().min(1, "Descreva o custo adicional.").max(200),
  amount: positiveMoney,
});

export const purchaseItemInputSchema = z.object({
  productId: z.string().uuid("Produto inválido."),
  description: z.string().trim().max(500).optional().nullable(),
  quantity: z.number().finite().positive("Quantidade deve ser maior que zero.").max(1e9),
  unitPrice: positiveMoney,
  discountAmount: money.optional(),
  additionalCosts: z.array(purchaseAdditionalCostSchema).max(20).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const purchaseOrderInputSchema = z.object({
  supplierId: z.string().uuid("Fornecedor inválido."),
  expectedDeliveryAt: z.string().trim().min(1).optional().nullable(),
  items: z.array(purchaseItemInputSchema).min(1, "Inclua ao menos um item.").max(200),
});

export type PurchaseOrderInputPayload = z.infer<typeof purchaseOrderInputSchema>;
export type PurchaseItemInputPayload = z.infer<typeof purchaseItemInputSchema>;

const idempotencyKey = z.string().trim().min(8, "Chave de idempotência curta.").max(120);

export const submitPurchaseSchema = z.object({
  idempotencyKey: idempotencyKey.optional(),
});

export const purchaseDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    justification: z.string().trim().max(1000).optional().nullable(),
    idempotencyKey: idempotencyKey.optional(),
  })
  .refine(
    (value) => value.decision !== "rejected" || (value.justification ?? "").trim().length >= 5,
    { message: "Rejeição exige justificativa (mínimo 5 caracteres).", path: ["justification"] }
  );

export const issuePurchaseSchema = z.object({
  idempotencyKey: idempotencyKey,
});

export const purchaseFollowUpSchema = z.object({
  type: z.enum(["confirmacao", "contato", "ocorrencia", "previsao"]),
  note: z.string().trim().min(3, "Descreva o contato/ocorrência.").max(1000),
  expectedDeliveryAt: z.string().trim().min(1).optional().nullable(),
  idempotencyKey: idempotencyKey.optional(),
});

export const purchaseReceiptSchema = z.object({
  itemId: z.string().uuid("Item inválido."),
  warehouseId: z.string().uuid("Depósito inválido."),
  quantity: z.number().finite().positive("Quantidade recebida deve ser maior que zero."),
  lotNumber: z.string().trim().min(1, "Informe o lote/corrida.").max(50),
  heatNumber: z.string().trim().max(50).optional().nullable(),
  unitCost: positiveMoney,
  locationAddress: z.string().trim().max(50).optional().nullable(),
  receivedAt: z.string().trim().min(1).optional().nullable(),
  supplierDocumentReference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: idempotencyKey,
});

export const purchaseReverseReceiptSchema = z.object({
  reason: z.string().trim().min(5, "Justificativa obrigatória para estorno.").max(1000),
  idempotencyKey: idempotencyKey,
});

export const purchaseCancelSchema = z.object({
  reason: z.string().trim().min(5, "Justificativa obrigatória para cancelamento.").max(1000),
  idempotencyKey: idempotencyKey.optional(),
});

export const approvalRuleRowSchema = z
  .object({
    minTotal: money,
    maxTotal: money.optional().nullable(),
    approverPermission: z.enum(PURCHASE_APPROVER_CAPABILITIES, {
      message: "Permissão de aprovador inválida.",
    }),
    requiredApprovals: z.number().int().min(1).max(5).optional(),
  })
  .refine((row) => row.maxTotal == null || Number(row.maxTotal) > Number(row.minTotal), {
    message: "O teto da faixa deve ser maior que o piso.",
    path: ["maxTotal"],
  });

export const saveApprovalMatrixSchema = z.object({
  rows: z.array(approvalRuleRowSchema).min(1, "Inclua ao menos uma faixa."),
  reason: z.string().trim().min(3, "Informe o motivo da alteração da matriz.").max(500),
});

export type SaveApprovalMatrixPayload = z.infer<typeof saveApprovalMatrixSchema>;
