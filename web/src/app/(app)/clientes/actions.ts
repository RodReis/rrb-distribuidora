"use server";

import { db } from "@/lib/db";
import { customers, auditLog } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const customerInputSchema = z.object({
  id: z.string().uuid().optional(),
  legalName: z.string().min(3, "Razão Social obrigatória"),
  tradeName: z.string().optional().nullable(),
  document: z.string().min(11, "CNPJ ou CPF deve ser válido"),
  city: z.string().optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  stateRegistration: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export async function saveCustomer(input: CustomerInput) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_clientes", "write");

  const contacts = {
    email: input.email || undefined,
    phone: input.phone || undefined,
    contactName: input.contactName || undefined,
  };

  if (input.id) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, input.id))
      .limit(1);

    if (!existing) throw new Error("Cliente não encontrado.");

    const [updated] = await db
      .update(customers)
      .set({
        legalName: input.legalName,
        tradeName: input.tradeName || null,
        document: input.document,
        city: input.city || null,
        uf: input.uf ? input.uf.toUpperCase() : null,
        stateRegistration: input.stateRegistration || null,
        segment: input.segment || null,
        contacts,
        notes: input.notes || null,
        active: input.active,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, input.id))
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "customers",
      entityId: updated.id,
      action: "update",
      before: existing,
      after: updated,
    });

    revalidatePath("/clientes");
    return { success: true, customer: updated };
  } else {
    // Check duplication
    const [dup] = await db
      .select()
      .from(customers)
      .where(eq(customers.document, input.document))
      .limit(1);

    if (dup) throw new Error("Já existe um cliente cadastrado com este documento.");

    const [created] = await db
      .insert(customers)
      .values({
        tenantId: user.tenantId,
        legalName: input.legalName,
        tradeName: input.tradeName || null,
        document: input.document,
        city: input.city || null,
        uf: input.uf ? input.uf.toUpperCase() : null,
        stateRegistration: input.stateRegistration || null,
        segment: input.segment || null,
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
      entity: "customers",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });

    revalidatePath("/clientes");
    return { success: true, customer: created };
  }
}

export async function toggleCustomerStatus(customerId: string, currentStatus: boolean) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_clientes", "write");

  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!existing) throw new Error("Cliente não encontrado.");

  const [updated] = await db
    .update(customers)
    .set({
      active: !currentStatus,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning();

  await db.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    entity: "customers",
    entityId: customerId,
    action: "update",
    before: existing,
    after: updated,
  });

  revalidatePath("/clientes");
  return { success: true };
}
