import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { ProductsClient } from "./products-client";

export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const user = await getCurrentUser();

  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.tenantId, user.tenantId))
    .orderBy(desc(products.createdAt));

  return <ProductsClient initialProducts={allProducts} />;
}
