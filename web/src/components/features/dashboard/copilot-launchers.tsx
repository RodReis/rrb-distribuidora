"use client";

import * as React from "react";
import { SendHorizontal, Terminal } from "lucide-react";
import { COPILOT_QUICK_PROMPTS, openCopilot } from "@/lib/ai/copilot-events";

export function AskCopilotButton() {
  return (
    <button
      type="button"
      onClick={() => openCopilot()}
      className="inline-flex h-8 items-center gap-1.5 rounded bg-carmine-core px-3 font-sans text-label-caps font-semibold uppercase tracking-wider text-ice-white transition-colors hover:bg-carmine-signal active:bg-carmine-deep focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ice-white"
    >
      <Terminal className="h-4 w-4" />
      Perguntar ao Copiloto
      <kbd className="rounded bg-carmine-dark px-1 font-mono text-label-code">Ctrl+K</kbd>
    </button>
  );
}

export function CopilotTerminal() {
  const [value, setValue] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const prompt = value.trim();
    if (!prompt) return;
    openCopilot({ prompt, send: true });
    setValue("");
  }

  return (
    <section className="space-y-3 rounded-md border border-carbon-800 bg-carbon-900 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-carmine-core" />
          <h2 className="text-headline-sm font-semibold text-ice-white">
            Copiloto — Pergunte à operação
          </h2>
        </div>
        <span className="font-mono text-label-code text-titanium-muted">
          Somente leitura · responde só com dados das ferramentas auditadas
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-label-code uppercase text-titanium-muted">
          Prompts rápidos:
        </span>
        {COPILOT_QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => openCopilot({ prompt })}
            className="rounded border border-carbon-700 bg-carbon-800 px-2.5 py-1 text-body-sm text-titanium-light transition-colors hover:bg-carbon-700 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex.: Quais chapas A36 estão com menos de 10 dias de cobertura?"
          aria-label="Pergunta ao Copiloto"
          className="h-10 flex-1 rounded border border-carbon-700 bg-carbon-950 px-3 text-body-md text-ice-white placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded bg-carmine-core px-4 text-label-caps font-semibold uppercase tracking-wider text-ice-white transition-colors hover:bg-carmine-signal active:bg-carmine-deep disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ice-white"
        >
          Consultar
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
