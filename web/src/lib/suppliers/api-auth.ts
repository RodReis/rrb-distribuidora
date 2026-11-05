import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUserSession } from "@/lib/auth/rbac";
import { isSupplierError, supplierErrorMessage } from "./errors";
import { getSupplierCapabilities } from "./capabilities";
import type { SupplierCapability } from "./types";

type Guard = { user: CurrentUserSession; error?: never } | { user?: never; error: NextResponse };

export async function guardSupplier(capability: SupplierCapability): Promise<Guard> {
  let user: CurrentUserSession;
  try {
    user = await getCurrentUser();
  } catch {
    return {
      error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }),
    };
  }
  if (!getSupplierCapabilities(user.role).includes(capability)) {
    return {
      error: NextResponse.json(
        { error: "Seu papel não tem permissão para esta operação." },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export function supplierErrorResponse(error: unknown) {
  return NextResponse.json(
    { error: supplierErrorMessage(error), ...(isSupplierError(error) ? { code: error.code } : {}) },
    {
      status: isSupplierError(error) ? error.status : 500,
    }
  );
}
