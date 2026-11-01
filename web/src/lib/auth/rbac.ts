import { auth } from "@/auth";
import { db } from "@/lib/db";
import { rolePermissions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { appModuleEnum, userRoleEnum } from "@/lib/db/schema";

type Module = (typeof appModuleEnum.enumValues)[number];
type Role = (typeof userRoleEnum.enumValues)[number];

export interface CurrentUserSession {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string;
}

export async function getCurrentUser(): Promise<CurrentUserSession> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const u = session.user as unknown as CurrentUserSession;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    tenantId: u.tenantId,
  };
}

export async function checkPermission(module: Module, action: "read" | "write"): Promise<boolean> {
  const user = await getCurrentUser();
  if (user.role === "admin") return true;

  const [perm] = await db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.role, user.role), eq(rolePermissions.module, module)))
    .limit(1);

  if (!perm) return false;
  return action === "read" ? perm.canRead : perm.canWrite;
}

export async function requirePermission(module: Module, action: "read" | "write" = "read") {
  const hasPerm = await checkPermission(module, action);
  if (!hasPerm) {
    throw new Error("FORBIDDEN: Sem permissão para esta operação.");
  }
}
