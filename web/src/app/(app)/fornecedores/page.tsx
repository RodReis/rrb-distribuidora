import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { desc, eq } from "drizzle-orm";
import { SuppliersClient } from "./suppliers-client";
import {
  getProductLeadTimes,
  listProductOptions,
  listProductSupplierTerms,
  listSupplierOptions,
} from "@/lib/suppliers/service";
import { canConfigureSupplierTerms } from "@/lib/suppliers/capabilities";
import { hasSupplierCapability } from "@/lib/suppliers/capabilities";
import { Forbidden } from "@/components/shared/forbidden";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const user = await getCurrentUser();
  if (!hasSupplierCapability(user.role, "supplier.read")) {
    return <Forbidden module="Fornecedores" />;
  }

  const [allSuppliers, terms, products, suppliersOptions] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(eq(suppliers.tenantId, user.tenantId))
      .orderBy(desc(suppliers.createdAt)),
    listProductSupplierTerms(user.tenantId, user.role),
    listProductOptions(user.tenantId),
    listSupplierOptions(user.tenantId),
  ]);
  const leadTimes = await getProductLeadTimes(
    user.tenantId,
    products.map((product) => product.id)
  );
  const canConfigureTerms = canConfigureSupplierTerms(user.role);
  return (
    <SuppliersClient
      initialSuppliers={allSuppliers}
      initialTerms={terms}
      products={products}
      supplierOptions={suppliersOptions}
      leadTimes={leadTimes}
      canConfigureTerms={canConfigureTerms}
      canManageRegistry={user.role === "admin" || user.role === "comprador"}
    />
  );
}
