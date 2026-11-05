import { getCurrentUser } from "@/lib/auth/rbac";
import { hasLogisticsCapability } from "@/lib/logistics/capabilities";
import { LogisticsBoard } from "./logistics-board";

export const dynamic = "force-dynamic";

export default async function ExpedicoesPage() {
  const user = await getCurrentUser();
  const canRead = hasLogisticsCapability(user.role, "logistics.read");
  const canTrack = hasLogisticsCapability(user.role, "logistics.track");
  return (
    <LogisticsBoard
      canRead={canRead}
      canPrepare={hasLogisticsCapability(user.role, "logistics.prepare")}
      canDispatch={hasLogisticsCapability(user.role, "logistics.dispatch")}
      canTrack={canTrack}
    />
  );
}
