"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AudioMode,
  type AudioLayoutId,
  type ContainerId,
  type PatternId,
  type RateId,
  type ResolutionId,
  audioLayoutById,
  audioModeById,
  coerceRate,
  composeFormatId,
  containerById,
  DEFAULT_AUDIO_LAYOUT,
  DEFAULT_DURATION_SEC,
  DEFAULT_RATE,
  DEFAULT_RESOLUTION,
  formatById,
  maxDurationSecFor,
  LOGO_ACCEPT,
  LOGO_MAX_BYTES,
  LOGO_OPACITY_PCT,
  LOGO_POS_DEFAULT,
  LOGO_POSITIONS,
  LOGO_SIZE_PCT,
  MIN_DURATION_SEC,
  patternById,
} from "@/lib/presets";
import { clampDuration } from "@/lib/build-command";
import { FfmpegEngine, type ThreadMode } from "@/lib/ffmpeg-client";
import { sanitizeFileName, splitExtension } from "@/lib/utils";
import type { EngineState } from "@/components/engine-status-badge";

const engine = new FfmpegEngine();

export interface RenderedFile {
  url: string;
  name: string;
  sizeBytes: number;
  summary: string;
  /** True when a browser `<video>` can play it directly (MP4/MOV). */
  nativePlayback: boolean;
  /** Requested duration in seconds — used to build the hls.js preview playlist. */
  durationSec: number;
}

export interface LogoState {
  data: Uint8Array;
  ext: string;
  name: string;
  url: string;
  /** Image height / width — drives the accurate preview box */
  aspect: number;
}

// Secondary settings groups collapse to a one-line summary; only one is
// open at a time so the panel doesn't grow unbounded as features stack up.
export type SignalSection = "burnin" | "logo" | "audio";

export function useTestPatternEngine() {
  const [pattern, setPattern] = useState<PatternId>("smptehdbars");
  const [resolution, setResolutionState] = useState<ResolutionId>(DEFAULT_RESOLUTION);
  const [rate, setRateState] = useState<RateId>(DEFAULT_RATE);
  // Both setters coerce through the generated matrix so resolution × rate can
  // never compose an id FORMATS doesn't contain (e.g. interlaced outside 1080
  // falls back to the progressive rate at the same speed: i50 → p50).
  const setResolution = useCallback((res: ResolutionId) => {
    setResolutionState(res);
    setRateState((cur) => coerceRate(res, cur));
  }, []);
  const setRate = useCallback(
    (next: RateId) => setRateState(coerceRate(resolution, next)),
    [resolution]
  );
  const format = composeFormatId(resolution, rate);
  const [durationText, setDurationText] = useState(String(DEFAULT_DURATION_SEC));
  const [container, setContainer] = useState<ContainerId>("mp4");
  const [audio, setAudio] = useState<AudioMode>("tone-20");
  const [audioLayout, setAudioLayout] = useState<AudioLayoutId>(DEFAULT_AUDIO_LAYOUT);
  const [burnTimecode, setBurnTimecode] = useState(true);
  const [safeArea, setSafeArea] = useState(false);
  const [label, setLabel] = useState("");

  const [openSection, setOpenSection] = useState<SignalSection | null>(null);
  const toggleSection = useCallback(
    (id: SignalSection) => setOpenSection((cur) => (cur === id ? null : id)),
    []
  );

  const [logo, setLogo] = useState<LogoState | null>(null);
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

  const handleLogoSelect = useCallback(async (fileList: FileList | null) => {
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
  }, []);

  const durationNum = Number(durationText);
  // Big frames get a tighter duration cap (wasm memory budget) — see
  // maxDurationSecFor. The UI surfaces the format-specific max.
  const maxDurationSec = maxDurationSecFor(formatById(format));
  const durationSec = clampDuration(durationNum, maxDurationSec);
  const durationValid =
    Number.isFinite(durationNum) &&
    durationNum >= MIN_DURATION_SEC &&
    durationNum <= maxDurationSec;

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

  // Lip-sync drives its own stereo beep, so the layout choice doesn't apply.
  const layoutApplies = !isLipsync && audioLayout !== "stereo";
  const audioContainerSummary = `${audioModeById(audio).label}${
    layoutApplies ? ` · ${audioLayoutById(audioLayout).shortLabel}` : ""
  } · ${containerById(container).label}`;

  const summary = useMemo(() => {
    const mode = audioModeById(audio);
    // Keep line breaks at the " · " separators only: make spaces inside each
    // fixed descriptor non-breaking so tokens like "logo (bot l)" don't split.
    const nb = (s: string) => s.replace(/ /g, " ");
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
    if (layoutApplies) parts.push(nb(audioLayoutById(audioLayout).shortLabel));
    if (burnTimecode) parts.push("timecode");
    if (safeArea) parts.push(nb("safe areas"));
    // User free text stays breakable so a long label can still wrap.
    if (label.trim()) parts.push(`“${label.trim()}”`);
    if (logo) {
      const pos = activePreset ? activePreset.label.toLowerCase() : `${logoX}%,${logoY}%`;
      parts.push(nb(`logo (${pos})`));
    }
    return parts.join(" · ");
  }, [
    pattern,
    format,
    durationSec,
    audio,
    audioLayout,
    layoutApplies,
    burnTimecode,
    safeArea,
    label,
    isLipsync,
    logo,
    activePreset,
    logoX,
    logoY,
  ]);

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
          audioLayout,
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
  }, [
    pattern,
    format,
    durationSec,
    container,
    audio,
    audioLayout,
    burnTimecode,
    label,
    safeArea,
    logo,
    logoX,
    logoY,
    logoSize,
    logoOpacity,
    summary,
  ]);

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

  return {
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
    threadMode,
    engineError,
    loadEngine,

    rendering,
    progress,
    lastLog,
    renderError,
    file,
    fileNameInput,
    setFileNameInput,
    fileNameParts,
    downloadName,

    durationSec,
    durationValid,
    maxDurationSec,
    isLipsync,
    summary,
    burnInSummary,
    logoSummary,
    audioContainerSummary,
    busy,
    handleGenerate,
    handleCancel,
  };
}

export type TestPatternEngine = ReturnType<typeof useTestPatternEngine>;
