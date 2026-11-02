import { AppShell } from "@/components/layout/app-shell";
import { CopilotDrawer } from "@/components/copilot/copilot-drawer";
import { getCurrentUser } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }

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
    </AppShell>
  );
}
