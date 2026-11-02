"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTermsAcceptances } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { AI_TERMS_VERSION } from "@/lib/terms/ai-terms";

/** Registra o aceite da versão vigente pelo usuário logado. Idempotente. */
export async function acceptAiTermsAction() {
  const user = await getCurrentUser();
  await db
    .insert(aiTermsAcceptances)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      version: AI_TERMS_VERSION,
    })
    .onConflictDoNothing({
      target: [aiTermsAcceptances.userId, aiTermsAcceptances.version],
    });
  revalidatePath("/", "layout");
}
