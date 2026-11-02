import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <div role="tablist" className="flex items-center gap-5 border-b border-carbon-800">
      {items.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            href={tab.href}
            scroll={false}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 text-body-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-carmine-core",
              isActive
                ? "border-carmine-core text-ice-white font-medium"
                : "border-transparent text-titanium-muted hover:text-ice-white"
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className="rounded border border-carbon-700 bg-carbon-950 px-1.5 font-mono text-label-code text-titanium-light">
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
