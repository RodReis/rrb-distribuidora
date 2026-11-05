import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";

export async function GET() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  return NextResponse.json({ error: "Dados financeiros indisponíveis." }, { status: 403 });
}
