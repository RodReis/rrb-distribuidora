import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { agentActions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const body = await req.json();
  const { actionId, score } = body;
  if (!actionId || (score !== 1 && score !== -1)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 422 });
  }
  await db
    .update(agentActions)
    .set({ feedbackScore: score })
    .where(and(eq(agentActions.id, actionId), eq(agentActions.tenantId, user.tenantId)));
  return NextResponse.json({ ok: true });
}