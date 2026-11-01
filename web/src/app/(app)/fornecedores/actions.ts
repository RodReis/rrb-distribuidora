"use server";

import { db } from "@/lib/db";
import { suppliers, auditLog } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const supplierInputSchema = z.object({
  id: z.string().uuid().optional(),
  legalName: z.string().min(3, "Razão Social obrigatória"),
  tradeName: z.string().optional().nullable(),
  cnpj: z.string().min(14, "CNPJ deve ser válido"),
  type: z.enum(["usina", "distribuidor", "trader"]),
  city: z.string().optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  leadTimeDays: z.number().int().min(1, "Lead time mínimo de 1 dia"),
  paymentTerms: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;

export async function saveSupplier(input: SupplierInput) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_fornecedores", "write");

  const contacts = {
    email: input.email || undefined,
    phone: input.phone || undefined,
    contactName: input.contactName || undefined,
  };

  if (input.id) {
    const [existing] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.id))
      .limit(1);

    if (!existing) throw new Error("Fornecedor não encontrado.");

    const [updated] = await db
      .update(suppliers)
      .set({
        legalName: input.legalName,
        tradeName: input.tradeName || null,
        cnpj: input.cnpj,
        type: input.type,
        city: input.city || null,
        uf: input.uf ? input.uf.toUpperCase() : null,
        leadTimeDays: input.leadTimeDays,
        paymentTerms: input.paymentTerms || null,
        contacts,
        notes: input.notes || null,
        active: input.active,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, input.id))
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "suppliers",
      entityId: updated.id,
      action: "update",
      before: existing,
      after: updated,
    });

    revalidatePath("/fornecedores");
    return { success: true, supplier: updated };
  } else {
    // Check CNPJ duplication
    const [dup] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.cnpj, input.cnpj))
      .limit(1);

    if (dup) throw new Error("Já existe um fornecedor cadastrado com este CNPJ.");

    const [created] = await db
      .insert(suppliers)
      .values({
        tenantId: user.tenantId,
        legalName: input.legalName,
        tradeName: input.tradeName || null,
        cnpj: input.cnpj,
        type: input.type,
        city: input.city || null,
        uf: input.uf ? input.uf.toUpperCase() : null,
        leadTimeDays: input.leadTimeDays,
        paymentTerms: input.paymentTerms || null,
        contacts,
        notes: input.notes || null,
        active: input.active,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "suppliers",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });

    revalidatePath("/fornecedores");
    return { success: true, supplier: created };
  }
}

export async function toggleSupplierStatus(supplierId: string, currentStatus: boolean) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_fornecedores", "write");

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!existing) throw new Error("Fornecedor não encontrado.");

  const [updated] = await db
    .update(suppliers)
    .set({
      active: !currentStatus,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplierId))
    .returning();

  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "suppliers",
    entityId: supplierId,
    action: "update",
    before: existing,
    after: updated,
  });

  revalidatePath("/fornecedores");
  return { success: true };
}
