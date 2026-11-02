"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  "aria-label"?: string;
  className?: string;
}

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  disabled,
  error,
  className,
  ...rest
}: SelectMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    if (disabled) return;
    setHighlight(Math.max(selectedIndex, 0));
    setOpen((o) => !o);
  }

  function choose(i: number) {
    const opt = options[i];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return toggle();
      setHighlight((h) => (h + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(highlight);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest["aria-label"]}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded border border-carbon-700 bg-carbon-950 px-3 text-left text-body-md transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core focus-visible:border-carmine-core",
          "hover:border-titanium-steel/60 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
          error && "border-signal-risk",
          selected ? "text-ice-white" : "text-titanium-dark"
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-titanium-muted" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded border border-carbon-700 bg-carbon-950 py-1 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)]"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between px-3 py-1.5 text-body-md",
                i === highlight ? "bg-carbon-800 text-ice-white" : "text-titanium-light"
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <Check className="h-3.5 w-3.5 text-carmine-signal" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
