"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface FormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function FormDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: FormDrawerProps) {
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div
        className={cn(
          "relative z-10 h-full w-full bg-carbon-900 border-l border-carbon-700 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200",
          width
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-carbon-800 flex items-center justify-between bg-carbon-950/60">
          <div>
            <h2 className="text-headline-sm font-headline-sm text-ice-white">{title}</h2>
            {subtitle && (
              <p className="text-body-sm font-body-sm text-titanium-muted">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-carbon-800 text-titanium-muted hover:text-ice-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-carbon-800 bg-carbon-950/60 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
