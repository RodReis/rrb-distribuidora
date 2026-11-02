"use client";
import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export function CopilotDrawer() {
  const [open, setOpen] = useState(false);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/copilot/chat" }),
  });
  const [input, setInput] = useState("");

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-lg"
      >
        Copiloto
      </button>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-96 h-[500px] bg-carbon-900 border border-carbon-800 rounded-lg shadow-xl flex flex-col text-ice-white">
          <div className="p-3 border-b font-semibold">Copiloto MetalAgents</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className="inline-block rounded-md bg-carbon-800 px-2 py-1 whitespace-pre-wrap">
                  {m.parts?.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
                  {!m.parts && (m as { content?: string }).content}
                </div>
              </div>
            ))}
            {status === "streaming" && <div className="text-titanium-muted">...</div>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              sendMessage({ text: input });
              setInput("");
            }}
            className="p-3 border-t flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border rounded px-2 py-1"
              placeholder="Pergunte sobre a operação..."
            />
            <button type="submit" className="px-3 py-1 bg-primary text-primary-foreground rounded">
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}