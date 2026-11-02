"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [allowed, setAllowed] = React.useState(true);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/market/notifications");
      if (res.status === 403 || res.status === 401) return setAllowed(false);
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[]; unread: number };
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* próxima tentativa no polling */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    const res = await fetch("/api/market/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setItems((l) => l.map((n) => ({ ...n, read: true })));
      setUnread(0);
      toast.success("Notificações marcadas como lidas.");
    } else {
      toast.error("Não foi possível marcar as notificações como lidas.");
    }
  }

  if (!allowed) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificações: ${unread} não lidas` : "Notificações"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative cursor-pointer rounded p-1.5 text-titanium-muted transition-colors hover:bg-carbon-800 hover:text-ice-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-carmine-core px-1 font-mono text-[10px] text-ice-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded border border-carbon-700 bg-carbon-900 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between border-b border-carbon-800 px-3 py-2">
            <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
              Alertas de mercado
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="cursor-pointer text-body-sm text-carmine-signal hover:text-ice-white"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-body-sm text-titanium-muted">
                Nenhum alerta até agora.
              </li>
            )}
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "border-b border-carbon-800 px-3 py-2",
                  !n.read && "bg-carbon-800/60"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-carmine-core" />
                  )}
                  <div>
                    <div className="text-body-sm font-medium text-ice-white">{n.title}</div>
                    <div className="text-body-sm text-titanium-muted">{n.message}</div>
                    <div className="mt-0.5 font-mono text-label-code text-titanium-dark">
                      {new Date(n.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
