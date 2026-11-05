import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { FINANCE_STATUS } from "@/lib/finance/capabilities";

export async function GET() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  return NextResponse.json(FINANCE_STATUS);
}
