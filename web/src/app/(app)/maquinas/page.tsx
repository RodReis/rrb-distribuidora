import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { MaquinasClient } from "./maquinas-client";

export const dynamic = "force-dynamic";

export default async function MaquinasPage() {
  const user = await getCurrentUser();

  const allMachines = await db
    .select()
    .from(machines)
    .where(eq(machines.tenantId, user.tenantId))
    .orderBy(desc(machines.createdAt));

  return <MaquinasClient initialMachines={allMachines} />;
}
