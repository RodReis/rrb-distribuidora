import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";

async function unavailable() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  return NextResponse.json({ error: "Crédito não configurado." }, { status: 403 });
}

export const GET = unavailable;
export const POST = unavailable;
