import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { SuppliersClient } from "./suppliers-client";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const user = await getCurrentUser();

  const allSuppliers = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.tenantId, user.tenantId))
    .orderBy(desc(suppliers.createdAt));

  return <SuppliersClient initialSuppliers={allSuppliers} />;
}
