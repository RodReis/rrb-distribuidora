import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1.5 text-label-code font-mono", className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-titanium-dark">/</span>}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-titanium-muted hover:text-ice-white transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-carmine-signal" : "text-titanium-muted"}>
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
