import { NextResponse } from "next/server";
import { checkPermission, getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import type { ProductionCapability } from "./capabilities";
import { hasProductionCapability } from "./capabilities";
import { ProductionError } from "./errors";

type Guard = { user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse };

export async function guardProduction(
  capability: ProductionCapability,
  options: { requireStockWrite?: boolean } = {}
): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }

  if (!hasProductionCapability(user.role, capability)) {
    return {
      error: NextResponse.json(
        { error: `Seu papel não tem a permissão "${capability}".` },
        { status: 403 }
      ),
    };
  }

  if (options.requireStockWrite) {
    try {
      if (!(await checkPermission("estoque_retalhos", "write"))) {
        return {
          error: NextResponse.json(
            { error: "Consumo também exige permissão de escrita em estoque." },
            { status: 403 }
          ),
        };
      }
    } catch {
      return {
        error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
      };
    }
  }

  return { user };
}

export function productionErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  const status = error instanceof ProductionError ? error.status : 400;
  return NextResponse.json({ error: message }, { status });
}
