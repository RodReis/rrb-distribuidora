"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Loader2,
  Send,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "@/components/shared/inline-markdown";
import {
  COPILOT_OPEN_EVENT,
  COPILOT_QUICK_PROMPTS,
  type CopilotOpenDetail,
} from "@/lib/ai/copilot-events";

type CopilotMessage = UIMessage<{ actionId?: string }>;

const transport = new DefaultChatTransport({ api: "/api/copilot/chat" });

function formatToolInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  return entries
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function CopilotDrawer() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [feedback, setFeedback] = React.useState<Record<string, 1 | -1>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate } = useChat<CopilotMessage>({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  const send = React.useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value) return;
      void sendMessage({ text: value });
      setInput("");
    },
    [sendMessage]
  );

  React.useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<CopilotOpenDetail>).detail ?? {};
      setOpen(true);
      if (detail.prompt && detail.send) {
        send(detail.prompt);
      } else if (detail.prompt) {
        setInput(detail.prompt);
        window.setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        window.setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener(COPILOT_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(COPILOT_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [send]);

  React.useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function sendFeedback(actionId: string, score: 1 | -1) {
    try {
      const res = await fetch("/api/copilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, score }),
      });
      if (!res.ok) throw new Error();
      setFeedback((prev) => ({ ...prev, [actionId]: score }));
      toast.success("Avaliação registrada. Obrigado.");
    } catch {
      toast.error("Não foi possível registrar a avaliação. Tente novamente.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Abrir Copiloto"
        className="fixed bottom-4 right-4 z-40 inline-flex h-9 items-center gap-2 rounded bg-carmine-core px-3 text-body-md font-medium text-ice-white transition-colors hover:bg-carmine-signal active:bg-carmine-deep focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ice-white"
      >
        <Terminal className="h-4 w-4" />
        Copiloto
        <kbd className="rounded bg-carmine-dark px-1 font-mono text-label-code">Ctrl+K</kbd>
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Copiloto MetalAgents"
          className="fixed bottom-16 right-4 z-40 flex h-[34rem] max-h-[80vh] w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-carbon-700 bg-carbon-900 text-ice-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-carbon-800 px-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body-md font-semibold">Copiloto MetalAgents</span>
              <span className="font-mono text-label-code text-titanium-muted">
                Somente leitura · dados via ferramentas auditadas
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar Copiloto"
              className="rounded p-1.5 text-titanium-muted transition-colors hover:bg-carbon-800 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-body-md">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-body-sm text-titanium-muted">
                  Pergunte sobre estoque, mercado, orçamentos, retalhos e fornecedores. Se não
                  houver ferramenta para a pergunta, o Copiloto avisa em vez de inventar.
                </p>
                <div className="flex flex-col gap-1.5">
                  {COPILOT_QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={busy}
                      className="rounded border border-carbon-700 bg-carbon-950 px-2.5 py-1.5 text-left text-body-sm text-titanium-light transition-colors hover:border-carmine-core/60 hover:text-ice-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === "user";
              const actionId = m.metadata?.actionId;
              const textParts = m.parts.filter((p) => p.type === "text");
              const toolParts = m.parts.filter(isToolUIPart);
              return (
                <div
                  key={m.id}
                  className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}
                >
                  {toolParts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {toolParts.map((p, i) => {
                        const done = p.state === "output-available";
                        const failed = p.state === "output-error";
                        return (
                          <span
                            key={i}
                            title={formatToolInput(p.input)}
                            className="inline-flex max-w-full items-center gap-1 rounded border border-carbon-700 bg-carbon-950 px-1.5 py-0.5 font-mono text-label-code text-titanium-light"
                          >
                            {failed ? (
                              <AlertTriangle className="h-3 w-3 text-carmine-signal" />
                            ) : done ? (
                              <Check className="h-3 w-3 text-signal-buy" />
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin text-titanium-muted" />
                            )}
                            <span className="truncate">
                              {getToolName(p)}
                              {formatToolInput(p.input) && ` · ${formatToolInput(p.input)}`}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {textParts.length > 0 && (
                    <div
                      className={cn(
                        "max-w-[92%] whitespace-pre-wrap rounded px-2.5 py-1.5 leading-relaxed",
                        isUser
                          ? "bg-carbon-800 text-ice-white"
                          : "border border-carbon-800 bg-carbon-950 text-titanium-light"
                      )}
                    >
                      {textParts.map((p, i) => (
                        <span key={i}>
                          <InlineMarkdown text={(p as { text: string }).text} />
                        </span>
                      ))}
                    </div>
                  )}

                  {!isUser && actionId && !busy && (
                    <div className="flex items-center gap-1 text-titanium-muted">
                      <span className="mr-1 font-mono text-label-code">Útil?</span>
                      {([1, -1] as const).map((score) => (
                        <button
                          key={score}
                          type="button"
                          disabled={feedback[actionId] !== undefined}
                          onClick={() => sendFeedback(actionId, score)}
                          aria-label={score === 1 ? "Resposta útil" : "Resposta não útil"}
                          className={cn(
                            "rounded p-1 transition-colors hover:bg-carbon-800 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:cursor-default disabled:hover:bg-transparent",
                            feedback[actionId] === score &&
                              (score === 1 ? "text-signal-buy" : "text-carmine-signal")
                          )}
                        >
                          {score === 1 ? (
                            <ThumbsUp className="h-3.5 w-3.5" />
                          ) : (
                            <ThumbsDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-center gap-2 text-body-sm text-titanium-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Consultando os dados…
              </div>
            )}

            {error && !busy && (
              <div className="flex items-start gap-2 rounded border border-carmine-core/40 bg-carmine-core/10 p-2.5 text-body-sm text-carmine-signal">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  Não foi possível obter a resposta. Verifique a conexão e a configuração do modelo.
                  <button
                    type="button"
                    onClick={() => void regenerate()}
                    className="mt-1 block font-medium text-ice-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) send(input);
            }}
            className="flex gap-2 border-t border-carbon-800 p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre a operação…"
              aria-label="Pergunta ao Copiloto"
              className="h-9 flex-1 rounded border border-carbon-700 bg-carbon-950 px-3 text-body-md text-ice-white placeholder:text-titanium-dark focus-visible:border-carmine-core focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Enviar pergunta"
              className="inline-flex h-9 w-9 items-center justify-center rounded bg-carmine-core text-ice-white transition-colors hover:bg-carmine-signal active:bg-carmine-deep disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ice-white"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
