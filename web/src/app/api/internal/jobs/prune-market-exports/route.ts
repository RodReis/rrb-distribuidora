import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marketExports } from "@/lib/db/schema";
import { guardCron } from "@/lib/market/api-auth";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;
  const cutoff = new Date(Date.now() - 365 * 86_400_000);
  const deleted = await db
    .delete(marketExports)
    .where(lt(marketExports.createdAt, cutoff))
    .returning({ id: marketExports.id });
  return NextResponse.json({ deleted: deleted.length, cutoff: cutoff.toISOString() });
}
