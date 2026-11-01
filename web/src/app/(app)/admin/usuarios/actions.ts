"use server";

import { db } from "@/lib/db";
import { users, auditLog } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { sendInviteEmail } from "@/lib/email/resend";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import * as argon2 from "argon2";
import { z } from "zod";

const ROLE_VALUES = ["admin", "diretor", "comprador", "vendedor", "estoque", "financeiro"] as const;
type Role = (typeof ROLE_VALUES)[number];

const inviteSchema = z.object({
  name: z.string().min(3, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  role: z.enum(ROLE_VALUES),
});

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let password = "";
  for (const b of bytes) {
    password += alphabet[b % alphabet.length];
  }
  return password;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN: Apenas administradores gerenciam usuários.");
  }
  return user;
}

export async function inviteUser(input: { name: string; email: string; role: Role }) {
  const admin = await requireAdmin();

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Dados inválidos.");
  }

  const email = parsed.data.email.toLowerCase();

  const [dup] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (dup) {
    throw new Error("Já existe um usuário cadastrado com este e-mail.");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

  const [created] = await db
    .insert(users)
    .values({
      tenantId: admin.tenantId,
      email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
      active: true,
    })
    .returning();

  const emailSent = await sendInviteEmail(email, created.name, tempPassword);

  await db.insert(auditLog).values({
    tenantId: admin.tenantId,
    userId: admin.id,
    entity: "users",
    entityId: created.id,
    action: "insert",
    before: null,
    after: { id: created.id, email: created.email, name: created.name, role: created.role },
  });

  revalidatePath("/admin/usuarios");
  return {
    success: true,
    user: { id: created.id, email: created.email, name: created.name, role: created.role },
    tempPassword,
    emailSent,
  };
}

export async function updateUser(input: { id: string; name: string; role: Role }) {
  const admin = await requireAdmin();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, input.id), eq(users.tenantId, admin.tenantId)))
    .limit(1);

  if (!existing) throw new Error("Usuário não encontrado.");

  const [updated] = await db
    .update(users)
    .set({
      name: input.name,
      role: input.role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.id))
    .returning();

  await db.insert(auditLog).values({
    tenantId: admin.tenantId,
    userId: admin.id,
    entity: "users",
    entityId: updated.id,
    action: "update",
    before: { name: existing.name, role: existing.role },
    after: { name: updated.name, role: updated.role },
  });

  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function resetUserPassword(userId: string) {
  const admin = await requireAdmin();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, admin.tenantId)))
    .limit(1);

  if (!existing) throw new Error("Usuário não encontrado.");

  const tempPassword = generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  const emailSent = await sendInviteEmail(existing.email, existing.name, tempPassword);

  await db.insert(auditLog).values({
    tenantId: admin.tenantId,
    userId: admin.id,
    entity: "users",
    entityId: userId,
    action: "update",
    before: null,
    after: { action: "password_reset" },
  });

  revalidatePath("/admin/usuarios");
  return { success: true, tempPassword, emailSent };
}

export async function toggleUserActive(userId: string) {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    throw new Error("Você não pode desativar o seu próprio acesso.");
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, admin.tenantId)))
    .limit(1);

  if (!existing) throw new Error("Usuário não encontrado.");

  const [updated] = await db
    .update(users)
    .set({ active: !existing.active, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  await db.insert(auditLog).values({
    tenantId: admin.tenantId,
    userId: admin.id,
    entity: "users",
    entityId: userId,
    action: "update",
    before: { active: existing.active },
    after: { active: updated.active },
  });

  revalidatePath("/admin/usuarios");
  return { success: true, active: updated.active };
}
