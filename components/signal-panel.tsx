"use client";

import { AlertCircle, Film, ImagePlus, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SegmentedGroup } from "@/components/segmented-group";
import { AccordionSection } from "@/components/accordion-section";
import { LogoPlacementPreview } from "@/components/logo-placement-preview";
import { cn } from "@/lib/utils";
import {
  AUDIO_LAYOUTS,
  AUDIO_MODES,
  CONTAINERS,
  LOGO_ACCEPT,
  LOGO_OPACITY_PCT,
  LOGO_SIZE_PCT,
  LOGO_POSITIONS,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  PATTERNS,
  RESOLUTIONS,
  formatById,
  patternById,
  ratesForResolution,
} from "@/lib/presets";
import type { TestPatternEngine } from "@/lib/use-test-pattern-engine";

const DURATION_CHIPS = [10, 30, 60, 120] as const;

export function SignalPanel({ engine }: { engine: TestPatternEngine }) {
  const {
    pattern,
    setPattern,
    resolution,
    setResolution,
    rate,
    setRate,
    format,
    durationText,
    setDurationText,
    container,
    setContainer,
    audio,
    setAudio,
    audioLayout,
    setAudioLayout,
    burnTimecode,
    setBurnTimecode,
    safeArea,
    setSafeArea,
    slidingBox,
    setSlidingBox,
    label,
    setLabel,
    openSection,
    toggleSection,
    logo,
    logoX,
    setLogoX,
    logoY,
    setLogoY,
    logoSize,
    setLogoSize,
    logoOpacity,
    setLogoOpacity,
    logoError,
    logoInputRef,
    handleLogoSelect,
    clearLogo,
    activePreset,
    engineState,
    engineError,
    loadEngine,
    rendering,
    progress,
    lastLog,
    renderError,
    durationSec,
    durationValid,
    maxDurationSec,
    isLipsync,
    summary,
    burnInSummary,
    logoSummary,
    audioContainerSummary,
    busy,
    threadMode,
    handleGenerate,
    handleCancel,
  } = engine;

  const fmt = formatById(format);

  return (
    <Card className="flex w-full flex-col border-border/80 shadow-none lg:max-h-full lg:max-w-[480px] lg:min-h-0 lg:shrink-0 lg:overflow-hidden">
      <CardHeader className="pb-4 lg:shrink-0">
        <CardTitle className="text-base font-semibold tracking-tight">Signal</CardTitle>
        <p className="text-xs text-muted-foreground">
          Synthetic lavfi sources — nothing is uploaded, everything renders locally.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5 pt-0 lg:min-h-0 lg:overflow-hidden">
        {/* -mx-1/px-1 keep 4px inside the scroll clip so focus rings survive */}
        <div className="flex flex-col gap-5 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1">
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Format
            </Label>
            <div role="group" aria-label="Format" className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label
                  htmlFor="resolution"
                  className="text-[11px] font-normal text-muted-foreground/70"
                >
                  Resolution
                </Label>
                <Select
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as typeof resolution)}
                  disabled={rendering}
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="rate"
                  className="text-[11px] font-normal text-muted-foreground/70"
                >
                  Frame rate
                </Label>
                <Select
                  id="rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value as typeof rate)}
                  disabled={rendering}
                >
                  {ratesForResolution(resolution).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {fmt.interlaced ? (
              <p className="text-xs text-muted-foreground">
                Interlaced TFF — encoded with interlaced coding flags; timecode counts at{" "}
                {fmt.dropFrame ? "29.97 drop-frame" : `${fmt.tcRate} fps non-drop`}.
              </p>
            ) : null}
            {maxDurationSec < MAX_DURATION_SEC ? (
              <p className="text-xs text-muted-foreground">
                Large frames are slow to encode in the browser, and duration is capped at{" "}
                {maxDurationSec}s at this size to fit the wasm memory budget.
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
                max={maxDurationSec}
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                disabled={rendering}
                className="w-24"
              />
              {DURATION_CHIPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={rendering || s > maxDurationSec}
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
                Clamped to {durationSec}s (allowed {MIN_DURATION_SEC}–{maxDurationSec}s
                {maxDurationSec < MAX_DURATION_SEC ? " at this frame size" : ""}).
              </p>
            ) : null}
          </div>

          <AccordionSection
            title="Burn-in"
            summary={burnInSummary}
            isOpen={openSection === "burnin"}
            onToggle={() => toggleSection("burnin")}
          >
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={burnTimecode}
                onChange={(e) => setBurnTimecode(e.target.checked)}
                disabled={rendering}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Running timecode (
              {fmt.dropFrame ? "drop-frame, from 00:00:00;00" : "non-drop, from 00:00:00:00"})
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
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={slidingBox}
                onChange={(e) => setSlidingBox(e.target.checked)}
                disabled={rendering}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Freeze-detection box (marches across — stops if the signal freezes)
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
          </AccordionSection>

          <AccordionSection
            title="Logo overlay"
            summary={logoSummary}
            isOpen={openSection === "logo"}
            onToggle={() => toggleSection("logo")}
          >
            <input
              ref={logoInputRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="sr-only"
              onChange={(e) => void handleLogoSelect(e.target.files)}
            />
            {logo ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded border border-border bg-[repeating-conic-gradient(#0000_0_25%,#3334_0_50%)_50%/12px_12px] object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {logo.name}
                  </span>
                  <button
                    type="button"
                    onClick={clearLogo}
                    disabled={rendering}
                    className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
                <LogoPlacementPreview
                  url={logo.url}
                  logoAspect={logo.aspect}
                  frameAspect={fmt.width / fmt.height}
                  xPct={logoX}
                  yPct={logoY}
                  sizePct={logoSize}
                  disabled={rendering}
                  onChange={(x, y) => {
                    setLogoX(x);
                    setLogoY(y);
                  }}
                />
                <p className="text-[11px] text-muted-foreground/70">
                  Drag the logo to position it; the dashed guide is the 3% safe margin.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Position</span>
                    <span className="text-[11px] text-muted-foreground/70">
                      {activePreset ? activePreset.label : `${logoX}%, ${logoY}%`}
                    </span>
                  </div>
                  <SegmentedGroup
                    ariaLabel="Logo position preset"
                    items={LOGO_POSITIONS}
                    value={(activePreset?.id ?? "none") as (typeof LOGO_POSITIONS)[number]["id"]}
                    onChange={(id) => {
                      const p = LOGO_POSITIONS.find((x) => x.id === id);
                      if (p) {
                        setLogoX(p.x);
                        setLogoY(p.y);
                      }
                    }}
                    disabled={rendering}
                  />
                  <label className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="w-16 shrink-0">Horizontal</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={logoX}
                      onChange={(e) => setLogoX(Number(e.target.value))}
                      disabled={rendering}
                      className="flex-1 accent-[hsl(var(--primary))]"
                    />
                    <span className="w-9 shrink-0 text-right tabular-nums text-foreground">
                      {logoX}%
                    </span>
                  </label>
                  <label className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="w-16 shrink-0">Vertical</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={logoY}
                      onChange={(e) => setLogoY(Number(e.target.value))}
                      disabled={rendering}
                      className="flex-1 accent-[hsl(var(--primary))]"
                    />
                    <span className="w-9 shrink-0 text-right tabular-nums text-foreground">
                      {logoY}%
                    </span>
                  </label>
                </div>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-16 shrink-0">Size</span>
                  <input
                    type="range"
                    min={LOGO_SIZE_PCT.min}
                    max={LOGO_SIZE_PCT.max}
                    value={logoSize}
                    onChange={(e) => setLogoSize(Number(e.target.value))}
                    disabled={rendering}
                    className="flex-1 accent-[hsl(var(--primary))]"
                  />
                  <span className="w-9 shrink-0 text-right tabular-nums text-foreground">
                    {logoSize}%
                  </span>
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-16 shrink-0">Opacity</span>
                  <input
                    type="range"
                    min={LOGO_OPACITY_PCT.min}
                    max={LOGO_OPACITY_PCT.max}
                    value={logoOpacity}
                    onChange={(e) => setLogoOpacity(Number(e.target.value))}
                    disabled={rendering}
                    className="flex-1 accent-[hsl(var(--primary))]"
                  />
                  <span className="w-9 shrink-0 text-right tabular-nums text-foreground">
                    {logoOpacity}%
                  </span>
                </label>
                {threadMode === "multi" ? (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                    Compositing a logo needs the single-threaded core, so these renders are
                    slower than logo-free ones.
                  </p>
                ) : null}
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={rendering}
                className="w-full gap-2"
              >
                <ImagePlus className="h-4 w-4" />
                Upload PNG or JPEG
              </Button>
            )}
            {logoError ? (
              <p className="text-xs text-destructive">{logoError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Composited over the pattern, under the timecode/label. Stays in your browser —
                never uploaded.
              </p>
            )}
          </AccordionSection>

          <AccordionSection
            title="Audio & container"
            summary={audioContainerSummary}
            isOpen={openSection === "audio"}
            onToggle={() => toggleSection("audio")}
          >
            <div className="flex flex-wrap gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Level (1 kHz)
                </Label>
                <SegmentedGroup
                  ariaLabel="Level"
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

            <div className="space-y-2">
              <Label
                htmlFor="audio-layout"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Channels / line-up
              </Label>
              <Select
                id="audio-layout"
                value={audioLayout}
                onChange={(e) => setAudioLayout(e.target.value as typeof audioLayout)}
                disabled={rendering || isLipsync}
              >
                {AUDIO_LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>

            {isLipsync ? (
              <p className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Lip sync drives its own audio: a 100 ms beep on every flash, at the selected tone
                level. Silence is ignored (defaults to −20 dBFS), and the channel line-up is fixed
                to stereo.
              </p>
            ) : null}
          </AccordionSection>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4 lg:shrink-0">
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
