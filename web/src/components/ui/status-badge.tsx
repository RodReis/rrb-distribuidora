import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  status?: "ativo" | "inativo" | "homologacao" | "buy" | "hold" | "risk" | string;
  /** Tom explícito para estados de domínio novos (ex.: compras). Vence o mapa por `status`. */
  tone?: "buy" | "hold" | "risk" | "neutral";
  label?: string;
  pulse?: boolean;
}

const TONE_STYLES: Record<"buy" | "hold" | "risk" | "neutral", { wrapper: string; dot: string }> = {
  buy: {
    wrapper: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
    dot: "bg-signal-buy",
  },
  hold: {
    wrapper: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
    dot: "bg-signal-hold",
  },
  risk: {
    wrapper: "border-signal-risk/40 bg-signal-risk/10 text-signal-risk",
    dot: "bg-signal-risk",
  },
  neutral: {
    wrapper: "border-titanium-dark/50 bg-carbon-800 text-titanium-muted",
    dot: "bg-titanium-muted",
  },
};

export function StatusBadge({ status, tone, label, pulse = true }: StatusBadgeProps) {
  const key = (status ?? "neutral").toLowerCase();
  let toneKey: "buy" | "hold" | "risk" | "neutral" = tone ?? "buy";
  let displayLabel = label || (status ? status.toUpperCase() : "");

  if (!tone) {
    switch (key) {
      case "ativo":
      case "buy":
        toneKey = "buy";
        if (!label) displayLabel = "ATIVO";
        break;
      case "homologacao":
      case "hold":
        toneKey = "hold";
        if (!label) displayLabel = "HOMOLOGAÇÃO";
        break;
      case "inativo":
        toneKey = "neutral";
        if (!label) displayLabel = "INATIVO";
        break;
      case "risk":
        toneKey = "risk";
        if (!label) displayLabel = "RISCO";
        break;
      default:
        toneKey = "neutral";
        break;
    }
  }

  const styles = TONE_STYLES[toneKey];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-label-code font-mono uppercase tracking-wider border",
        styles.wrapper
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full inline-block",
          styles.dot,
          pulse && (status ?? "").toLowerCase() === "ativo" && "animate-pulse"
        )}
      />
      {displayLabel}
    </span>
  );
}
