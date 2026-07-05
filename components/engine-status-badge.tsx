"use client";

import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThreadMode } from "@/lib/ffmpeg-client";

export type EngineState = "loading" | "ready" | "error";

export function EngineStatusBadge({
  engineState,
  threadMode,
}: {
  engineState: EngineState;
  threadMode: ThreadMode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        engineState === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : threadMode === "multi"
            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      )}
      title={
        threadMode === "multi"
          ? "SharedArrayBuffer available — multi-threaded ffmpeg core"
          : "Page is not cross-origin isolated — single-threaded ffmpeg core"
      }
    >
      <Cpu className="h-3.5 w-3.5" />
      {engineState === "loading"
        ? "loading engine…"
        : engineState === "error"
          ? "engine failed"
          : threadMode === "multi"
            ? "multi-threaded"
            : "single-threaded"}
    </span>
  );
}
