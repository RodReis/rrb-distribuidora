import { cn } from "@/lib/utils";
import type { Level } from "@/lib/dashboard/insights";

export const LEVEL_STYLES: Record<Level, { chip: string; dot: string; text: string }> = {
  ok: {
    chip: "border-signal-buy/40 bg-signal-buy/10 text-signal-buy",
    dot: "bg-signal-buy",
    text: "text-signal-buy",
  },
  attention: {
    chip: "border-signal-hold/40 bg-signal-hold/10 text-signal-hold",
    dot: "bg-signal-hold",
    text: "text-signal-hold",
  },
  risk: {
    chip: "border-carmine-core/40 bg-carmine-core/10 text-carmine-signal",
    dot: "bg-carmine-signal",
    text: "text-carmine-signal",
  },
  info: {
    chip: "border-carbon-700 bg-carbon-800 text-titanium-light",
    dot: "bg-titanium-light",
    text: "text-titanium-light",
  },
  nodata: {
    chip: "border-carbon-700 bg-carbon-800 text-titanium-muted",
    dot: "bg-titanium-steel",
    text: "text-titanium-muted",
  },
};

export const GLOBAL_LEVEL_LABEL: Record<Level, string> = {
  ok: "CONTROLADO",
  attention: "ATENÇÃO",
  risk: "ELEVADO",
  info: "INFORMATIVO",
  nodata: "SEM DADOS",
};

export function LevelBadge({
  level,
  children,
  className,
}: {
  level: Level;
  children: React.ReactNode;
  className?: string;
}) {
  const style = LEVEL_STYLES[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-label-code uppercase tracking-wider",
        style.chip,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {children}
    </span>
  );
}
