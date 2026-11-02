import { NextResponse } from "next/server";
import { checkPermission, getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";

type Guard = { user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse };

export async function guardStock(action: "read" | "write"): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (!(await checkPermission("estoque_retalhos", action))) {
    return {
      error: NextResponse.json(
        { error: "Seu papel não tem permissão para esta operação." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export function stockErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  return NextResponse.json({ error: message }, { status: 400 });
}
