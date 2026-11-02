import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { dailyBriefings } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const [row] = await db
    .select()
    .from(dailyBriefings)
    .where(eq(dailyBriefings.tenantId, user.tenantId))
    .orderBy(desc(dailyBriefings.createdAt))
    .limit(1);
  return NextResponse.json({ briefing: row ?? null });
}