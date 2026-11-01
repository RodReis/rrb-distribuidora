import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { eq, asc } from "drizzle-orm";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();

  if (user.role !== "admin") {
    return <Forbidden module="Usuários & Acesso" />;
  }

  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, user.tenantId))
    .orderBy(asc(users.name));

  return <UsersClient initialUsers={allUsers} currentUserId={user.id} />;
}
