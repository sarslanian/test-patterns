"use client";

import { AlertCircle, Film, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SegmentedGroup } from "@/components/segmented-group";
import { cn } from "@/lib/utils";
import {
  AUDIO_MODES,
  CONTAINERS,
  FORMATS,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  PATTERNS,
  formatById,
  patternById,
} from "@/lib/presets";
import type { TestPatternEngine } from "@/lib/use-test-pattern-engine";

const DURATION_CHIPS = [10, 30, 60, 120] as const;

export function SignalPanel({ engine }: { engine: TestPatternEngine }) {
  const {
    pattern,
    setPattern,
    format,
    setFormat,
    durationText,
    setDurationText,
    container,
    setContainer,
    audio,
    setAudio,
    burnTimecode,
    setBurnTimecode,
    safeArea,
    setSafeArea,
    label,
    setLabel,
    engineState,
    engineError,
    loadEngine,
    rendering,
    progress,
    lastLog,
    renderError,
    durationSec,
    durationValid,
    isLipsync,
    summary,
    busy,
    threadMode,
    handleGenerate,
    handleCancel,
  } = engine;

  return (
    <Card className="w-full border-border/80 shadow-none lg:max-w-[480px] lg:shrink-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold tracking-tight">Signal</CardTitle>
        <p className="text-xs text-muted-foreground">
          Synthetic lavfi sources — nothing is uploaded, everything renders locally.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-0">
        <div className="space-y-2">
          <Label
            htmlFor="pattern"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Pattern
          </Label>
          <Select
            id="pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value as typeof pattern)}
            disabled={rendering}
          >
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{patternById(pattern).description}</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Format</Label>
          <SegmentedGroup
            ariaLabel="Format"
            items={FORMATS}
            value={format}
            onChange={setFormat}
            disabled={rendering}
          />
          {formatById(format).interlaced ? (
            <p className="text-xs text-muted-foreground">
              Interlaced TFF — encoded with interlaced coding flags; timecode counts at 29.97
              drop-frame.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="duration"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Duration (seconds)
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="duration"
              type="number"
              min={MIN_DURATION_SEC}
              max={MAX_DURATION_SEC}
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              disabled={rendering}
              className="w-24"
            />
            {DURATION_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={rendering}
                onClick={() => setDurationText(String(s))}
                className={cn(
                  "flex h-9 touch-manipulation items-center justify-center rounded-md border border-border/80 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
                  durationText === String(s) && "border-primary/60 text-foreground"
                )}
              >
                {s}s
              </button>
            ))}
          </div>
          {!durationValid ? (
            <p className="text-xs text-amber-200">
              Clamped to {durationSec}s (allowed {MIN_DURATION_SEC}–{MAX_DURATION_SEC}s).
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Burn-in</Label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={burnTimecode}
              onChange={(e) => setBurnTimecode(e.target.checked)}
              disabled={rendering}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Running timecode (drop-frame, from 00:00:00;00)
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={safeArea}
              onChange={(e) => setSafeArea(e.target.checked)}
              disabled={rendering}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Safe-area markers (93% action / 90% title + center cross)
          </label>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={rendering}
            maxLength={80}
            placeholder="Optional label, e.g. GAME 4 SRT TEST — CH 2"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Audio (1 kHz)
            </Label>
            <SegmentedGroup
              ariaLabel="Audio"
              items={AUDIO_MODES}
              value={audio}
              onChange={setAudio}
              disabled={rendering}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Container
            </Label>
            <SegmentedGroup
              ariaLabel="Container"
              items={CONTAINERS}
              value={container}
              onChange={setContainer}
              disabled={rendering}
            />
          </div>
        </div>

        {isLipsync ? (
          <p className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Lip sync drives its own audio: a 100 ms beep on every flash, at the selected tone
            level. Silence is ignored (defaults to −20 dBFS).
          </p>
        ) : null}

        <div className="space-y-3 border-t border-border/60 pt-4">
          {rendering ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="w-full touch-manipulation gap-2"
            >
              <Square className="h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={busy}
              className="w-full touch-manipulation gap-2"
            >
              {engineState === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              {engineState === "loading" ? "Loading engine…" : "Generate"}
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">{summary}</p>

          {rendering ? (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="truncate font-mono text-[11px] leading-snug text-muted-foreground">
                {Math.round(progress * 100)}% {lastLog ? `· ${lastLog}` : ""}
              </p>
            </div>
          ) : null}

          {threadMode === "single" && engineState === "ready" ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
              COOP/COEP headers are not applied, so the slower single-threaded core is in use.
              Long durations will take a while.
            </p>
          ) : null}

          {engineState === "error" ? (
            <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Failed to load ffmpeg.wasm
                </p>
                <p className="break-words font-mono text-xs leading-snug text-muted-foreground">
                  {engineError}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadEngine()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          {renderError ? (
            <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-destructive">Render failed</p>
                <p className="whitespace-pre-wrap break-words font-mono text-xs leading-snug text-muted-foreground">
                  {renderError}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
