import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        <select
          ref={ref}
          className={cn(
            "h-9 w-full appearance-none rounded bg-carbon-950 px-3 py-1 pr-8 text-body-md text-ice-white border border-carbon-700 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core focus-visible:border-carmine-core disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            error && "border-signal-risk focus-visible:ring-signal-risk",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-titanium-muted" />
      </div>
    );
  }
);
Select.displayName = "Select";
