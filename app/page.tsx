"use client";

import { Tv } from "lucide-react";
import { EngineStatusBadge } from "@/components/engine-status-badge";
import { SignalPanel } from "@/components/signal-panel";
import { PreviewPanel } from "@/components/preview-panel";
import { useTestPatternEngine } from "@/lib/use-test-pattern-engine";

export default function TestPatternPage() {
  const engine = useTestPatternEngine();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:h-screen lg:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card py-3">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Tv className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-base font-semibold tracking-tight">
              Test Pattern Generator
            </span>
          </div>
          <EngineStatusBadge engineState={engine.engineState} threadMode={engine.threadMode} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:flex-row lg:items-start lg:gap-6 lg:min-h-0 lg:overflow-hidden">
        <SignalPanel engine={engine} />
        <PreviewPanel
          file={engine.file}
          fileNameInput={engine.fileNameInput}
          setFileNameInput={engine.setFileNameInput}
          fileNameParts={engine.fileNameParts}
          downloadName={engine.downloadName}
        />
      </main>
    </div>
  );
}
