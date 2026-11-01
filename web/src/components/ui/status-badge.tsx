import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  status: "ativo" | "inativo" | "homologacao" | "buy" | "hold" | "risk" | string;
  label?: string;
  pulse?: boolean;
}

export function StatusBadge({ status, label, pulse = true }: StatusBadgeProps) {
  let colorStyles = "border-signal-buy/40 bg-signal-buy/10 text-signal-buy";
  let dotColor = "bg-signal-buy";
  let displayLabel = label || status.toUpperCase();

  switch (status.toLowerCase()) {
    case "ativo":
    case "buy":
      colorStyles = "border-signal-buy/40 bg-signal-buy/10 text-signal-buy";
      dotColor = "bg-signal-buy";
      if (!label) displayLabel = "ATIVO";
      break;
    case "homologacao":
    case "hold":
      colorStyles = "border-signal-hold/40 bg-signal-hold/10 text-signal-hold";
      dotColor = "bg-signal-hold";
      if (!label) displayLabel = "HOMOLOGAÇÃO";
      break;
    case "inativo":
    case "risk":
      colorStyles = "border-titanium-dark/50 bg-carbon-800 text-titanium-muted";
      dotColor = "bg-titanium-muted";
      if (!label) displayLabel = "INATIVO";
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-label-code font-mono uppercase tracking-wider border",
        colorStyles
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full inline-block",
          dotColor,
          pulse && status.toLowerCase() === "ativo" && "animate-pulse"
        )}
      />
      {displayLabel}
    </span>
  );
}
