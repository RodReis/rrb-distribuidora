import { getCurrentUser } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const user = await getCurrentUser();

  // Spec: /api/import/[entity] — POST | admin
  if (user.role !== "admin") {
    return <Forbidden module="Importador de Catálogo (CSV)" />;
  }

  return <ImportClient />;
}
