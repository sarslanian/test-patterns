"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ChevronDown,
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
import { cn, sanitizeFileName, splitExtension } from "@/lib/utils";
import {
  type AudioMode,
  type ContainerId,
  type FormatId,
  type PatternId,
  AUDIO_MODES,
  CONTAINERS,
  DEFAULT_DURATION_SEC,
  FORMATS,
  LOGO_ACCEPT,
  LOGO_MARGIN_PCT,
  LOGO_MAX_BYTES,
  LOGO_OPACITY_PCT,
  LOGO_POS_DEFAULT,
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
import { clamp, clampDuration, logoLayoutFractions } from "@/lib/build-command";
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

/**
 * Collapsible settings group. The panel keeps growing as features are added
 * (logo overlay alone stacks a preview + 4 controls), so secondary groups
 * collapse to a one-line summary and only one expands at a time — the parent
 * owns `isOpen`/`onToggle` so it can enforce that.
 */
function AccordionSection({
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

/**
 * Live, aspect-correct preview of where the logo lands and how big it is.
 * Geometry comes from logoLayoutFractions (the same math as the ffmpeg
 * overlay), and the logo is draggable to set position by eye.
 */
function LogoPlacementPreview({
  url,
  logoAspect,
  frameAspect,
  xPct,
  yPct,
  sizePct,
  disabled,
  onChange,
}: {
  url: string;
  logoAspect: number;
  frameAspect: number;
  xPct: number;
  yPct: number;
  sizePct: number;
  disabled?: boolean;
  onChange: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<{ offX: number; offY: number } | null>(null);

  const layout = logoLayoutFractions(xPct, yPct, sizePct, logoAspect, frameAspect);
  const marginX = LOGO_MARGIN_PCT / 100;
  const marginY = marginX * frameAspect;
  const travelX = Math.max(1e-6, 1 - layout.width - 2 * marginX);
  const travelY = Math.max(1e-6, 1 - layout.height - 2 * marginY);

  const applyFromPointer = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    const grab = grabRef.current;
    if (!box || !grab) return;
    const r = box.getBoundingClientRect();
    const leftFrac = (clientX - r.left) / r.width - grab.offX;
    const topFrac = (clientY - r.top) / r.height - grab.offY;
    const x = ((leftFrac - marginX) / travelX) * 100;
    const y = ((topFrac - marginY) / travelY) * 100;
    onChange(Math.round(clamp(x, 0, 100, 100)), Math.round(clamp(y, 0, 100, 100)));
  };

  return (
    <div
      ref={boxRef}
      className="relative w-full select-none overflow-hidden rounded-md border border-border bg-black"
      style={{ aspectRatio: String(frameAspect) }}
    >
      {/* 3% safe-margin guide — the bounds of the logo's travel */}
      <div
        className="pointer-events-none absolute rounded-sm border border-dashed border-white/15"
        style={{
          left: `${marginX * 100}%`,
          right: `${marginX * 100}%`,
          top: `${marginY * 100}%`,
          bottom: `${marginY * 100}%`,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        onPointerDown={(e) => {
          if (disabled) return;
          const box = boxRef.current;
          if (!box) return;
          const r = box.getBoundingClientRect();
          grabRef.current = {
            offX: (e.clientX - r.left) / r.width - layout.left,
            offY: (e.clientY - r.top) / r.height - layout.top,
          };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerMove={(e) => {
          if (grabRef.current) applyFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          grabRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerCancel={() => {
          grabRef.current = null;
        }}
        className={cn(
          "absolute touch-none object-contain",
          disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        )}
        style={{
          left: `${layout.left * 100}%`,
          top: `${layout.top * 100}%`,
          width: `${layout.width * 100}%`,
          height: "auto",
        }}
      />
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

  // Secondary settings groups collapse to a one-line summary; only one is
  // open at a time so the panel doesn't grow unbounded as features stack up.
  type SignalSection = "burnin" | "logo" | "audio";
  const [openSection, setOpenSection] = useState<SignalSection | null>(null);
  const toggleSection = (id: SignalSection) =>
    setOpenSection((cur) => (cur === id ? null : id));

  const [logo, setLogo] = useState<{
    data: Uint8Array;
    ext: string;
    name: string;
    url: string;
    /** Image height / width — drives the accurate preview box */
    aspect: number;
  } | null>(null);
  const [logoX, setLogoX] = useState<number>(LOGO_POS_DEFAULT.x);
  const [logoY, setLogoY] = useState<number>(LOGO_POS_DEFAULT.y);
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
  // Editable base filename (no extension) for download; reset to the
  // selection-derived default on every successful render.
  const [fileNameInput, setFileNameInput] = useState("");
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
      // Measure the natural aspect so the placement preview is dimensionally
      // accurate (ffmpeg's scale=W:-1 preserves this same ratio).
      const aspect = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1);
        img.onerror = () => resolve(1);
        img.src = url;
      });
      setLogo({ data, ext, name: selected.name, url, aspect });
      setOpenSection("logo");
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

  // The active quick-set preset, if the sliders currently sit on one of them.
  const activePreset = LOGO_POSITIONS.find((p) => p.x === logoX && p.y === logoY);

  // One-line summaries shown on each collapsed accordion section's header.
  const burnInSummary = (() => {
    const parts: string[] = [];
    if (burnTimecode) parts.push("timecode");
    if (safeArea) parts.push("safe areas");
    if (label.trim()) parts.push(`"${label.trim()}"`);
    return parts.length ? parts.join(", ") : "Off";
  })();

  const logoSummary = logo
    ? `${activePreset ? activePreset.label : `${logoX}%, ${logoY}%`} · ${logoSize}% · ${logoOpacity}%`
    : "None";

  const audioContainerSummary = `${audioModeById(audio).label} · ${containerById(container).label}`;

  const summary = useMemo(() => {
    const mode = audioModeById(audio);
    // Keep line breaks at the " · " separators only: make spaces inside each
    // fixed descriptor non-breaking so tokens like "logo (bot l)" don't split.
    const nb = (s: string) => s.replace(/ /g, "\u00A0");
    const parts = [
      nb(patternById(pattern).label),
      formatById(format).label,
      `${durationSec}s`,
      nb(
        isLipsync
          ? `beep ${mode.amplitude != null ? mode.label : "−20 dBFS"}`
          : mode.amplitude != null
            ? `1 kHz ${mode.label}`
            : "silence"
      ),
    ];
    if (burnTimecode) parts.push("timecode");
    if (safeArea) parts.push(nb("safe areas"));
    // User free text stays breakable so a long label can still wrap.
    if (label.trim()) parts.push(`“${label.trim()}”`);
    if (logo) {
      const pos = activePreset ? activePreset.label.toLowerCase() : `${logoX}%,${logoY}%`;
      parts.push(nb(`logo (${pos})`));
    }
    return parts.join(" · ");
  }, [pattern, format, durationSec, audio, burnTimecode, safeArea, label, isLipsync, logo, activePreset, logoX, logoY]);

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
                xPct: logoX,
                yPct: logoY,
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
      setFileNameInput(splitExtension(result.outputName).base);
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
      // generate() may have silently swapped cores (logo renders force the
      // single-threaded core) — resync the badge/warnings to what's actually
      // loaded rather than what was loaded before this render started.
      if (engine.activeMode) setThreadMode(engine.activeMode);
      setRendering(false);
    }
  }, [pattern, format, durationSec, container, audio, burnTimecode, label, safeArea, logo, logoX, logoY, logoSize, logoOpacity, summary]);

  const handleCancel = useCallback(() => {
    engine.terminate();
    setRendering(false);
    setRenderError("Render cancelled.");
    void loadEngine();
  }, [loadEngine]);

  const busy = rendering || engineState === "loading";

  // Split once per render and reused below (download name, JSX placeholder,
  // extension badge) instead of re-parsing file.name at each call site.
  const fileNameParts = splitExtension(file?.name ?? "");

  // Sanitized custom name + the container's extension; falls back to the
  // selection-derived default if the field is empty or only invalid chars.
  const downloadBase = sanitizeFileName(fileNameInput).trim() || fileNameParts.base;
  const downloadName = !file
    ? ""
    : fileNameParts.ext
      ? `${downloadBase}.${fileNameParts.ext}`
      : downloadBase;

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

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:flex-row lg:items-start lg:gap-6 lg:min-h-0 lg:overflow-hidden">
        <Card className="flex w-full flex-col border-border/80 shadow-none lg:max-h-full lg:max-w-[480px] lg:min-h-0 lg:shrink-0 lg:overflow-hidden">
          <CardHeader className="pb-4 lg:shrink-0">
            <CardTitle className="text-base font-semibold tracking-tight">Signal</CardTitle>
            <p className="text-xs text-muted-foreground">
              Synthetic lavfi sources — nothing is uploaded, everything renders locally.
            </p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5 pt-0 lg:min-h-0 lg:overflow-hidden">
            <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
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
                    frameAspect={formatById(format).width / formatById(format).height}
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
                  Composited over the pattern, under the timecode/label. Stays in your
                  browser — never uploaded.
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
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
              {file ? (
                <div className="flex min-w-0 items-center gap-1">
                  <Input
                    value={fileNameInput}
                    onChange={(e) => setFileNameInput(sanitizeFileName(e.target.value))}
                    aria-label="File name"
                    maxLength={120}
                    spellCheck={false}
                    placeholder={fileNameParts.base}
                    className="h-6 min-w-0 flex-1 border-none bg-transparent px-1 font-mono text-xs text-muted-foreground shadow-none focus-visible:ring-1"
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    .{fileNameParts.ext} · {formatBytes(file.sizeBytes)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Generated file loops here</p>
              )}
            </div>
            {file ? (
              <a
                href={file.url}
                download={downloadName}
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
