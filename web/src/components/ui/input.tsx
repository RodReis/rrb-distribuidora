import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded bg-carbon-950 px-3 py-1 text-body-md text-ice-white placeholder-titanium-dark border border-carbon-700 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core focus-visible:border-carmine-core disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-signal-risk focus-visible:ring-signal-risk",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
