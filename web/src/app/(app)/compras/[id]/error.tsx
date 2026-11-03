"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Erro de carregamento do detalhe (falha de banco/serviço). O erro bruto não é
 * exibido; o usuário tem a ação de tentar novamente.
 */
export default function PurchaseDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[1500px] flex-col items-center justify-center text-center">
      <div className="rounded border border-signal-risk/30 bg-signal-risk/10 p-4 text-signal-risk">
        <AlertTriangle className="h-10 w-10" aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-headline-lg text-headline-lg text-ice-white">
        Não foi possível carregar o pedido
      </h1>
      <p className="mt-2 max-w-md font-body-md text-body-md text-titanium-muted">
        Ocorreu uma falha ao consultar o pedido de compra. Nenhuma alteração foi gravada. Tente
        recarregar a tela.
      </p>
      <Button variant="primary" size="md" className="mt-6" onClick={reset}>
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Tentar novamente
      </Button>
    </div>
  );
}
