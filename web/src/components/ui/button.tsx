import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "terminal";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

    const variants = {
      primary:
        "bg-carmine-core hover:bg-carmine-signal active:bg-carmine-deep text-ice-white shadow-md border-t border-white/10",
      secondary:
        "bg-carbon-800 hover:bg-carbon-700 active:bg-carbon-900 text-titanium-light hover:text-ice-white border border-titanium-steel/30 hover:border-titanium-steel/60",
      danger: "bg-red-950/60 hover:bg-red-900/80 text-signal-risk border border-signal-risk/40",
      ghost: "bg-transparent hover:bg-carbon-800 text-titanium-muted hover:text-ice-white",
      terminal:
        "bg-carbon-900 hover:bg-carbon-800 text-ice-white border border-carbon-700 font-mono",
    };

    const sizes = {
      sm: "h-7 px-2.5 text-body-sm rounded",
      md: "h-9 px-3.5 text-body-md rounded",
      lg: "h-11 px-5 text-body-lg rounded-md",
      icon: "h-8 w-8 rounded p-0 text-titanium-muted hover:text-ice-white",
    };

    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
