import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { CopilotDrawer } from "@/components/copilot/copilot-drawer";
import { TermsAcceptanceGate } from "@/components/features/terms/terms-acceptance-gate";
import { db } from "@/lib/db";
import { aiTermsAcceptances } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/rbac";
import { needsAiTermsAcceptance } from "@/lib/terms/ai-terms";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }

  // Aceite dos termos de uso da IA: bloqueia até aceitar a versão vigente (decisão do PI).
  const [latestAcceptance] = await db
    .select({ version: aiTermsAcceptances.version })
    .from(aiTermsAcceptances)
    .where(eq(aiTermsAcceptances.userId, user.id))
    .orderBy(desc(aiTermsAcceptances.acceptedAt))
    .limit(1);
  const mustAcceptTerms = needsAiTermsAcceptance(latestAcceptance?.version);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
      <CopilotDrawer />
      {mustAcceptTerms && <TermsAcceptanceGate />}
    </AppShell>
  );
}
