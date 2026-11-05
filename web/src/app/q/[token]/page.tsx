import { redirect } from "next/navigation";
import { getCurrentUser, checkPermission } from "@/lib/auth/rbac";
import { Forbidden } from "@/components/shared/forbidden";
import { resolveStockLabel } from "@/lib/stock/labels";

export const dynamic = "force-dynamic";

export default async function StockLabelPage({ params }: { params: Promise<{ token: string }> }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }
  if (!(await checkPermission("estoque_retalhos", "read")))
    return <Forbidden module="Estoque & Retalhos" />;
  const { token } = await params;
  const item = await resolveStockLabel(user.tenantId, token);
  if (!item)
    return (
      <main className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-semibold">Etiqueta inválida</h1>
        <p className="mt-2">Este QR foi revogado ou não pertence ao seu tenant.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-titanium-muted">
        Rastreabilidade de estoque
      </p>
      <h1 className="text-2xl font-semibold">{item.description}</h1>
      <dl className="grid grid-cols-2 gap-3 rounded border border-carbon-700 bg-carbon-900 p-4 text-sm">
        <dt>SKU</dt>
        <dd className="text-right font-mono">{item.sku}</dd>
        <dt>Identificação</dt>
        <dd className="text-right font-mono">{"lotNumber" in item ? item.lotNumber : item.code}</dd>
        <dt>Depósito</dt>
        <dd className="text-right">{item.warehouse}</dd>
        <dt>Local</dt>
        <dd className="text-right">{item.location || "—"}</dd>
        {"quantity" in item && (
          <>
            <dt>Saldo</dt>
            <dd className="text-right">{item.quantity}</dd>
          </>
        )}
        {"heatNumber" in item && (
          <>
            <dt>Corrida</dt>
            <dd className="text-right">{item.heatNumber || "—"}</dd>
          </>
        )}
        {"weightKg" in item && (
          <>
            <dt>Peso</dt>
            <dd className="text-right">{item.weightKg} kg</dd>
          </>
        )}
      </dl>
    </main>
  );
}
