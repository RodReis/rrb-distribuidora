"use server";

import { db } from "@/lib/db";
import { warehouses, machines, auditLog } from "@/lib/db/schema";
import { getCurrentUser, requirePermission } from "@/lib/auth/rbac";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// WAREHOUSE
export async function saveWarehouse(input: {
  id?: string;
  name: string;
  address?: string | null;
  type: "matriz" | "filial" | "patio";
  active?: boolean;
}) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_depositos", "write");

  if (input.id) {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, input.id));
    const [updated] = await db
      .update(warehouses)
      .set({
        name: input.name,
        address: input.address || null,
        type: input.type,
        active: input.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(warehouses.id, input.id))
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "warehouses",
      entityId: updated.id,
      action: "update",
      before: existing,
      after: updated,
    });
    revalidatePath("/depositos");
    return { success: true, item: updated };
  } else {
    const [created] = await db
      .insert(warehouses)
      .values({
        tenantId: user.tenantId,
        name: input.name,
        address: input.address || null,
        type: input.type,
        active: input.active ?? true,
      })
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "warehouses",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });
    revalidatePath("/depositos");
    return { success: true, item: created };
  }
}

// MACHINE
export async function saveMachine(input: {
  id?: string;
  name: string;
  type: "laser" | "plasma" | "guilhotina" | "serra" | "dobra" | "slitter";
  costPerHour: number;
  setupMin: number;
  active?: boolean;
}) {
  const user = await getCurrentUser();
  await requirePermission("cadastros_maquinas", "write");

  if (input.id) {
    const [existing] = await db.select().from(machines).where(eq(machines.id, input.id));
    const [updated] = await db
      .update(machines)
      .set({
        name: input.name,
        type: input.type,
        costPerHour: String(input.costPerHour),
        setupMin: input.setupMin,
        active: input.active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(machines.id, input.id))
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "machines",
      entityId: updated.id,
      action: "update",
      before: existing,
      after: updated,
    });
    revalidatePath("/maquinas");
    return { success: true, item: updated };
  } else {
    const [created] = await db
      .insert(machines)
      .values({
        tenantId: user.tenantId,
        name: input.name,
        type: input.type,
        costPerHour: String(input.costPerHour),
        setupMin: input.setupMin,
        active: input.active ?? true,
      })
      .returning();

    await db.insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      entity: "machines",
      entityId: created.id,
      action: "insert",
      before: null,
      after: created,
    });
    revalidatePath("/maquinas");
    return { success: true, item: created };
  }
}
