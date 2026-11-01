import { db } from "@/lib/db";
import { warehouses } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { DepositosClient } from "./depositos-client";

export const dynamic = "force-dynamic";

export default async function DepositosPage() {
  const user = await getCurrentUser();

  const allWarehouses = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.tenantId, user.tenantId))
    .orderBy(desc(warehouses.createdAt));

  return <DepositosClient initialWarehouses={allWarehouses} />;
}
