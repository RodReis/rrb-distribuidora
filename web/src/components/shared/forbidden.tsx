import * as React from "react";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export function Forbidden({ module }: { module?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="p-4 bg-signal-risk/10 border border-signal-risk/30 rounded text-signal-risk">
        <ShieldX className="w-10 h-10" />
      </div>
      <h1 className="mt-4 text-headline-lg font-headline-lg text-ice-white">
        403 — Acesso Restrito
      </h1>
      <p className="mt-2 text-body-md text-titanium-muted max-w-md">
        {module
          ? `Seu papel não possui permissão de acesso ao módulo "${module}".`
          : "Seu papel não possui permissão para acessar esta área."}{" "}
        Solicite acesso ao administrador do sistema.
      </p>
      <Button
        variant="secondary"
        size="md"
        className="mt-6"
        onClick={() => (window.location.href = "/produtos")}
      >
        Voltar para a Operação
      </Button>
    </div>
  );
}
