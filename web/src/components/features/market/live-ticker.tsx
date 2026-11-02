"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ASSET_SYMBOLS } from "@/lib/market/asset-symbols";
import { deltaTone, fmtNum, fmtPct } from "@/lib/market/format";

interface Quote {
  symbol: string;
  last: number | null;
  change24h: number | null;
}

const ITEMS = [
  { symbol: ASSET_SYMBOLS.LME_ALU, label: "LME ALUMÍNIO", prefix: "US$ ", decimals: 2 },
  { symbol: ASSET_SYMBOLS.HRC_US, label: "HRC BOBINA", prefix: "US$ ", decimals: 2 },
  { symbol: ASSET_SYMBOLS.PTAX, label: "PTAX USD", prefix: "R$ ", decimals: 4 },
];

export function LiveTicker() {
  const [quotes, setQuotes] = React.useState<Record<string, Quote>>({});
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market/quotes");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { quotes: Quote[] };
        if (cancelled) return;
        setQuotes(Object.fromEntries(data.quotes.map((q) => [q.symbol, q])));
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="hidden items-center gap-6 font-mono text-label-code lg:flex">
      {ITEMS.map((item) => {
        const q = quotes[item.symbol];
        return (
          <div key={item.symbol} className="flex items-center gap-1.5">
            <span className="text-titanium-dark">{item.label}</span>
            <span className="font-medium text-ice-white">
              {q?.last != null ? `${item.prefix}${fmtNum(q.last, item.decimals)}` : "—"}
            </span>
            <span className={cn(deltaTone(q?.change24h))}>{fmtPct(q?.change24h)}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5 text-titanium-dark">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", failed ? "bg-signal-risk" : "bg-signal-buy")}
        />
        <span>{failed ? "SEM CONEXÃO" : "MERCADO"}</span>
      </div>
    </div>
  );
}
