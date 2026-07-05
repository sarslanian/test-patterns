"use client";

import { cn } from "@/lib/utils";

export function SegmentedGroup<T extends string>({
  items,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          disabled={disabled}
          onClick={() => onChange(item.id)}
          className={cn(
            "flex-1 touch-manipulation whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            value === item.id
              ? "bg-background text-foreground shadow"
              : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
