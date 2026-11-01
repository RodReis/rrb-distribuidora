import * as React from "react";
import { Button } from "@/components/ui/button";
import { FolderX } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-carbon-750 bg-carbon-900/40 rounded my-4">
      <div className="p-3 bg-carbon-800 rounded-full text-titanium-muted mb-3">
        {icon || <FolderX className="w-8 h-8 text-titanium-steel" />}
      </div>
      <h3 className="text-headline-sm font-headline-sm text-ice-white">{title}</h3>
      <p className="text-body-sm font-body-sm text-titanium-muted max-w-sm mt-1 mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
