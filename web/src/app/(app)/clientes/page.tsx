import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { CustomersClient } from "./customers-client";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await getCurrentUser();

  const allCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, user.tenantId))
    .orderBy(desc(customers.createdAt));

  return <CustomersClient initialCustomers={allCustomers} />;
}
