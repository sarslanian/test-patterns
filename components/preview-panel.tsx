"use client";

import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TsPreview } from "@/components/ts-preview";
import { cn } from "@/lib/utils";
import type { RenderedFile } from "@/lib/use-test-pattern-engine";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewPanel({ file }: { file: RenderedFile | null }) {
  return (
    <Card className="flex w-full min-w-0 flex-1 flex-col border-border/80 shadow-none">
      <CardHeader className="!flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 space-y-0 border-b border-border/60 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
          {file ? (
            <p className="font-mono text-xs text-muted-foreground">
              {file.name} · {formatBytes(file.sizeBytes)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Generated file loops here</p>
          )}
        </div>
        {file ? (
          <a
            href={file.url}
            download={file.name}
            className={cn(buttonVariants(), "touch-manipulation gap-2")}
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        {file ? (
          file.nativePlayback ? (
            <>
              <video
                key={file.url}
                src={file.url}
                controls
                loop
                autoPlay
                muted
                playsInline
                className="w-full rounded-md border border-border bg-black"
              />
              <p className="text-xs text-muted-foreground">{file.summary}</p>
              <p className="text-xs text-muted-foreground/70">
                Preview is muted by default — unmute in the player to hear the reference tone.
              </p>
            </>
          ) : (
            <TsPreview
              key={file.url}
              src={file.url}
              durationSec={file.durationSec}
              summary={file.summary}
            />
          )
        ) : (
          <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Pick a pattern and format, then{" "}
              <span className="font-medium text-foreground">Generate</span>. The file is rendered
              entirely in your browser with ffmpeg.wasm.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
