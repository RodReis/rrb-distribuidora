import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";

export async function POST() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  return NextResponse.json({ error: "Importação financeira não configurada." }, { status: 403 });
}
