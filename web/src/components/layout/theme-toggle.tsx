"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, type Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema escuro", icon: Moon },
];

export function ThemeToggle() {
  const theme = useTheme();

  return (
    <div
      role="group"
      aria-label="Tema da interface"
      className="flex items-center rounded border border-carbon-800 bg-carbon-950 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => applyTheme(value)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core",
              active ? "bg-carbon-800 text-ice-white" : "text-titanium-muted hover:text-ice-white"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
