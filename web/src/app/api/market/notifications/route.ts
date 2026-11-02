import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, isNull, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { marketAlertNotifications as n } from "@/lib/db/schema";
import { guardMarket } from "@/lib/market/api-auth";

export async function GET() {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const { user } = guard;
  const mine = and(eq(n.tenantId, user.tenantId), or(eq(n.userId, user.id), isNull(n.userId)));

  const [items, [{ unread }]] = await Promise.all([
    db.select().from(n).where(mine).orderBy(desc(n.createdAt)).limit(30),
    db
      .select({ unread: count() })
      .from(n)
      .where(and(mine, eq(n.read, false))),
  ]);
  return NextResponse.json({ notifications: items, unread });
}

const patchSchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1) }),
  z.object({ all: z.literal(true) }),
]);

export async function PATCH(request: Request) {
  const guard = await guardMarket("read");
  if (guard.error) return guard.error;
  const { user } = guard;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const mine = and(eq(n.tenantId, user.tenantId), or(eq(n.userId, user.id), isNull(n.userId)));
  await db
    .update(n)
    .set({ read: true })
    .where("ids" in parsed.data ? and(mine, inArray(n.id, parsed.data.ids)) : mine);
  return NextResponse.json({ ok: true });
}
