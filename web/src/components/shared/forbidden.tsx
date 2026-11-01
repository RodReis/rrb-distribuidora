import Link from "next/link";
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
      <Link
        href="/produtos"
        className="mt-6 inline-flex items-center justify-center h-9 px-3.5 rounded text-body-md font-medium bg-carbon-800 hover:bg-carbon-700 active:bg-carbon-900 text-titanium-light hover:text-ice-white border border-titanium-steel/30 hover:border-titanium-steel/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
      >
        Voltar para a Operação
      </Link>
    </div>
  );
}
