import { getCurrentUser } from "@/lib/auth/rbac";
import { getProductionCapabilities } from "@/lib/production/capabilities";
import { ProductionBoard } from "@/components/features/production/production-board";

export const dynamic = "force-dynamic";

export default async function ProducaoPage() {
  const user = await getCurrentUser();
  return (
    <ProductionBoard
      operator={{ id: user.id, name: user.name, role: user.role }}
      capabilities={getProductionCapabilities(user.role)}
    />
  );
}
