"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Cpu,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Square,
  Tv,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TsPreview } from "@/components/ts-preview";
import { cn } from "@/lib/utils";
import {
  type AudioMode,
  type ContainerId,
  type FormatId,
  type LogoPosition,
  type PatternId,
  AUDIO_MODES,
  CONTAINERS,
  DEFAULT_DURATION_SEC,
  FORMATS,
  LOGO_ACCEPT,
  LOGO_MAX_BYTES,
  LOGO_OPACITY_PCT,
  LOGO_POSITIONS,
  LOGO_SIZE_PCT,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  PATTERNS,
  audioModeById,
  containerById,
  formatById,
  patternById,
} from "@/lib/presets";
import { clampDuration } from "@/lib/build-command";
import { FfmpegEngine, type ThreadMode } from "@/lib/ffmpeg-client";

const engine = new FfmpegEngine();

type EngineState = "loading" | "ready" | "error";

interface RenderedFile {
  url: string;
  name: string;
  sizeBytes: number;
  summary: string;
  /** True when a browser `<video>` can play it directly (MP4/MOV). */
  nativePlayback: boolean;
  /** Requested duration in seconds — used to build the hls.js preview playlist. */
  durationSec: number;
}

const DURATION_CHIPS = [10, 30, 60, 120] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SegmentedGroup<T extends string>({
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

export default function TestPatternPage() {
  const [pattern, setPattern] = useState<PatternId>("smptehdbars");
  const [format, setFormat] = useState<FormatId>("1080p5994");
  const [durationText, setDurationText] = useState(String(DEFAULT_DURATION_SEC));
  const [container, setContainer] = useState<ContainerId>("mp4");
  const [audio, setAudio] = useState<AudioMode>("tone-20");
  const [burnTimecode, setBurnTimecode] = useState(true);
  const [safeArea, setSafeArea] = useState(false);
  const [label, setLabel] = useState("");

  const [logo, setLogo] = useState<{
    data: Uint8Array;
    ext: string;
    name: string;
    url: string;
  } | null>(null);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("br");
  const [logoSize, setLogoSize] = useState<number>(LOGO_SIZE_PCT.default);
  const [logoOpacity, setLogoOpacity] = useState<number>(LOGO_OPACITY_PCT.default);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoUrlRef = useRef<string | null>(null);

  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [threadMode, setThreadMode] = useState<ThreadMode>("single");
  const [engineError, setEngineError] = useState<string | null>(null);

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastLog, setLastLog] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [file, setFile] = useState<RenderedFile | null>(null);
  const fileUrlRef = useRef<string | null>(null);

  const loadEngine = useCallback(async () => {
    setEngineState("loading");
    setEngineError(null);
    try {
      const mode = await engine.load();
      setThreadMode(mode);
      setEngineState("ready");
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : String(err));
      setEngineState("error");
    }
  }, []);

  useEffect(() => {
    void loadEngine();
    return () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    };
  }, [loadEngine]);

  const clearLogo = useCallback(() => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = null;
    setLogo(null);
    setLogoError(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }, []);

  const handleLogoSelect = useCallback(
    async (fileList: FileList | null) => {
      const selected = fileList?.[0];
      if (!selected) return;
      setLogoError(null);
      if (!LOGO_ACCEPT.split(",").includes(selected.type)) {
        setLogoError("Use a PNG or JPEG image.");
        return;
      }
      if (selected.size > LOGO_MAX_BYTES) {
        setLogoError(`Image is too large (max ${LOGO_MAX_BYTES / (1024 * 1024)} MB).`);
        return;
      }
      const data = new Uint8Array(await selected.arrayBuffer());
      const ext = selected.type === "image/png" ? "png" : "jpg";
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      const url = URL.createObjectURL(selected);
      logoUrlRef.current = url;
      setLogo({ data, ext, name: selected.name, url });
    },
    []
  );

  const durationNum = Number(durationText);
  const durationSec = clampDuration(durationNum);
  const durationValid =
    Number.isFinite(durationNum) &&
    durationNum >= MIN_DURATION_SEC &&
    durationNum <= MAX_DURATION_SEC;

  const isLipsync = pattern === "lipsync";

  const summary = useMemo(() => {
    const mode = audioModeById(audio);
    const parts = [
      patternById(pattern).label,
      formatById(format).label,
      `${durationSec}s`,
      isLipsync
        ? `beep ${mode.amplitude != null ? mode.label : "−20 dBFS"}`
        : mode.amplitude != null
          ? `1 kHz ${mode.label}`
          : "silence",
    ];
    if (burnTimecode) parts.push("timecode");
    if (safeArea) parts.push("safe areas");
    if (label.trim()) parts.push(`“${label.trim()}”`);
    if (logo) {
      const pos = LOGO_POSITIONS.find((p) => p.id === logoPosition)?.label ?? logoPosition;
      parts.push(`logo (${pos.toLowerCase()})`);
    }
    return parts.join(" · ");
  }, [pattern, format, durationSec, audio, burnTimecode, safeArea, label, isLipsync, logo, logoPosition]);

  const handleGenerate = useCallback(async () => {
    setRendering(true);
    setRenderError(null);
    setProgress(0);
    setLastLog("");
    try {
      const result = await engine.generate(
        {
          pattern,
          format,
          durationSec,
          container,
          audio,
          burnTimecode,
          label,
          safeArea,
          logo: logo
            ? {
                data: logo.data,
                ext: logo.ext,
                position: logoPosition,
                sizePct: logoSize,
                opacity: logoOpacity / 100,
              }
            : undefined,
        },
        {
          onProgress: setProgress,
          onLog: setLastLog,
        }
      );
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const blob = new Blob([result.data as BlobPart], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      fileUrlRef.current = url;
      setFile({
        url,
        name: result.outputName,
        sizeBytes: blob.size,
        summary,
        nativePlayback: containerById(container).previewable,
        durationSec,
      });
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
    } finally {
      setRendering(false);
    }
  }, [pattern, format, durationSec, container, audio, burnTimecode, label, safeArea, logo, logoPosition, logoSize, logoOpacity, summary]);

  const handleCancel = useCallback(() => {
    engine.terminate();
    setRendering(false);
    setRenderError("Render cancelled.");
    void loadEngine();
  }, [loadEngine]);

  const busy = rendering || engineState === "loading";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card py-3">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Tv className="h-5 w-5 shrink-0 text-primary" />
            <span className="text-base font-semibold tracking-tight">
              Test Pattern Generator
            </span>
          </div>
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:flex-row lg:items-start lg:gap-6">
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
                onChange={(e) => setPattern(e.target.value as PatternId)}
                disabled={rendering}
              >
                {PATTERNS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {patternById(pattern).description}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Format
              </Label>
              <SegmentedGroup
                ariaLabel="Format"
                items={FORMATS}
                value={format}
                onChange={setFormat}
                disabled={rendering}
              />
              {formatById(format).interlaced ? (
                <p className="text-xs text-muted-foreground">
                  Interlaced TFF — encoded with interlaced coding flags; timecode counts at
                  29.97 drop-frame.
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
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Burn-in
              </Label>
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

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Logo overlay
              </Label>
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
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Position</span>
                    <SegmentedGroup
                      ariaLabel="Logo position"
                      items={LOGO_POSITIONS}
                      value={logoPosition}
                      onChange={setLogoPosition}
                      disabled={rendering}
                    />
                  </div>
                  <label className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="w-14 shrink-0">Size</span>
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
                    <span className="w-14 shrink-0">Opacity</span>
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
                  Composited over the pattern, under the timecode/label. Stays in your
                  browser — never uploaded.
                </p>
              )}
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
                Lip sync drives its own audio: a 100 ms beep on every flash, at the selected
                tone level. Silence is ignored (defaults to −20 dBFS).
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
                  COOP/COEP headers are not applied, so the slower single-threaded core is in
                  use. Long durations will take a while.
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
                  <span className="font-medium text-foreground">Generate</span>. The file is
                  rendered entirely in your browser with ffmpeg.wasm.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
