"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-carbon-950 text-ice-white font-sans min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-carbon-900 border border-carbon-800 rounded-md p-6 text-center">
          <span className="font-mono text-label-code text-carmine-signal uppercase tracking-wider">
            Falha inesperada
          </span>
          <h1 className="mt-2 text-headline-lg font-headline-lg text-ice-white">Algo deu errado</h1>
          <p className="mt-2 text-body-md text-titanium-muted">
            O erro foi registrado e a equipe técnica será notificada. Tente novamente em instantes.
          </p>
          {error.digest && (
            <p className="mt-3 font-mono text-label-code text-titanium-dark">
              Código: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            className="mt-5 bg-carmine-core hover:bg-carmine-signal active:bg-carmine-deep text-ice-white px-4 py-2 rounded text-body-md font-semibold transition-colors cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
