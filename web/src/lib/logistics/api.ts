import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import { hasLogisticsCapability, type LogisticsCapability } from "./capabilities";
import { LogisticsError } from "./errors";
export { LogisticsError } from "./errors";

export async function guardLogistics(
  capability: LogisticsCapability
): Promise<{ user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse }> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (!hasLogisticsCapability(user.role, capability)) {
    return {
      error: NextResponse.json({ error: "Sem permissão para logística." }, { status: 403 }),
    };
  }
  return { user };
}

export function logisticsErrorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Erro inesperado." },
    {
      status: error instanceof LogisticsError ? error.status : 500,
    }
  );
}
