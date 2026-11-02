import { NextResponse } from "next/server";
import { checkPermission, getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";

type Guard = { user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse };

export async function guardQuotes(action: "read" | "write"): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (!(await checkPermission("vendas_orcamentos", action))) {
    return {
      error: NextResponse.json(
        { error: "Seu papel não tem permissão para esta operação." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

/** Liberação de margem exige diretor ou admin, independente da matriz. */
export async function guardMarginApproval(): Promise<Guard> {
  const guard = await guardQuotes("write");
  if (guard.error) {
    // Diretor pode não ter escrita na matriz de permissões, mas tem alçada
    // explícita de liberação de margem definida pela spec.
    try {
      const user = await getCurrentUser();
      if (user.role === "diretor" || user.role === "admin") {
        return { user };
      }
    } catch {
      // mantém o erro original
    }
    return guard;
  }
  if (guard.user.role !== "diretor" && guard.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas diretor ou administrador pode liberar margem." },
        { status: 403 }
      ),
    };
  }
  return guard;
}

export function quotesErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  return NextResponse.json({ error: message }, { status: 400 });
}
