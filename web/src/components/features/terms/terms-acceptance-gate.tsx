"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TermsDocument } from "./terms-document";
import { acceptAiTermsAction } from "@/app/(app)/terms/actions";

/**
 * Bloqueia o sistema até o usuário aceitar a versão vigente dos termos de uso da IA.
 * Decisão do PI (02/11/2026): aceite obrigatório no primeiro acesso.
 */
export function TermsAcceptanceGate() {
  const router = useRouter();
  const [checked, setChecked] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function handleAccept() {
    setSaving(true);
    try {
      await acceptAiTermsAction();
      toast.success("Termos de uso da IA aceitos.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar o aceite.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded border border-carbon-700 bg-carbon-900 shadow-xl">
        <div className="border-b border-carbon-800 px-5 py-4">
          <h2 className="text-headline-sm font-bold text-ice-white">Termos de Uso da IA</h2>
          <p className="mt-1 text-body-sm text-titanium-light">
            Para usar o MetalAgents, é preciso aceitar os termos que regem a utilização de IA no
            sistema. Role até o fim para continuar.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <TermsDocument />
        </div>

        <div className="flex flex-col gap-3 border-t border-carbon-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-titanium-light">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="size-4 accent-carmine-core"
              aria-label="Aceito os Termos de Uso da IA"
            />
            Li e aceito os Termos de Uso da IA
          </label>
          <Button variant="primary" size="md" disabled={!checked || saving} onClick={handleAccept}>
            {saving ? "Registrando..." : "Aceitar e continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
