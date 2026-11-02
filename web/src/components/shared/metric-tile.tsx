import * as React from "react";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "buy" | "hold" | "risk";

const VALUE_TONE: Record<MetricTone, string> = {
  neutral: "text-ice-white",
  buy: "text-signal-buy",
  hold: "text-signal-hold",
  risk: "text-carmine-signal",
};

export interface MetricTileProps {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  tone?: MetricTone;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function MetricTile({
  label,
  hint,
  icon,
  value,
  unit,
  tone = "neutral",
  badge,
  footer,
  className,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-md border border-carbon-800 bg-carbon-900 p-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-label-code uppercase tracking-wider text-titanium-muted">
            {label}
          </span>
          {hint && <span className="text-body-sm text-titanium-steel">{hint}</span>}
        </div>
        {icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-carbon-800 text-titanium-light">
            {icon}
          </div>
        )}
      </div>

      <div className="my-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-mono text-metric-display", VALUE_TONE[tone])}>{value}</span>
          {unit && <span className="font-mono text-label-code text-titanium-muted">{unit}</span>}
        </div>
        {badge}
      </div>

      {footer && <div className="font-mono text-label-code text-titanium-muted">{footer}</div>}
    </div>
  );
}
