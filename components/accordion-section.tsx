"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Collapsible settings group. The panel keeps growing as features are added
 * (logo overlay alone stacks a preview + 4 controls), so secondary groups
 * collapse to a one-line summary and only one expands at a time — the parent
 * owns `isOpen`/`onToggle` so it can enforce that.
 */
export function AccordionSection({
  title,
  summary,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left touch-manipulation"
      >
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {!isOpen ? (
            <span className="truncate text-xs text-muted-foreground/80">{summary}</span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </span>
      </button>
      {isOpen ? (
        <div className="space-y-4 border-t border-border/70 px-3 py-3">{children}</div>
      ) : null}
    </div>
  );
}
