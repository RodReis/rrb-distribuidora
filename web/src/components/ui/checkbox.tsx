"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 text-body-md text-titanium-light transition-colors hover:text-ice-white focus-visible:outline-none disabled:opacity-50 cursor-pointer group",
        className
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors group-focus-visible:ring-1 group-focus-visible:ring-carmine-core",
          checked ? "border-carmine-core bg-carmine-core" : "border-carbon-700 bg-carbon-950"
        )}
      >
        {checked && <Check className="h-3 w-3 text-ice-white" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}
