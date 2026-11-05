import { NextResponse } from "next/server";
import { checkPermission, getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import { hasMarketCapability } from "./capabilities";

type Guard = { user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse };

export async function guardMarket(action: "read" | "write"): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (!(await checkPermission("inteligencia_mercado", action))) {
    return {
      error: NextResponse.json(
        { error: "Seu papel não tem permissão para esta operação." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export async function guardMarketAlertConfigure(): Promise<Guard> {
  const guard = await guardMarket("write");
  if (guard.error) return guard;
  if (!hasMarketCapability(guard.user.role, "market.alert.configure")) {
    return {
      error: NextResponse.json(
        { error: "Permissão market.alert.configure necessária." },
        { status: 403 }
      ),
    };
  }
  return guard;
}

export function guardCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
