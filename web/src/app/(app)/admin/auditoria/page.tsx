import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { desc, eq } from "drizzle-orm";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const user = await getCurrentUser();

  // Spec: /admin/auditoria — GET | admin/diretor
  if (user.role !== "admin" && user.role !== "diretor") {
    return <Forbidden module="Trilha de Auditoria" />;
  }

  const entries = await db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.id))
    .limit(300);

  return <AuditClient initialEntries={entries} />;
}
