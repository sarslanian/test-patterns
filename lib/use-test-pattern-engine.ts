"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AudioMode,
  type ContainerId,
  type FormatId,
  type PatternId,
  audioModeById,
  containerById,
  DEFAULT_DURATION_SEC,
  formatById,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  patternById,
} from "@/lib/presets";
import { clampDuration } from "@/lib/build-command";
import { FfmpegEngine, type ThreadMode } from "@/lib/ffmpeg-client";
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

export function useTestPatternEngine() {
  const [pattern, setPattern] = useState<PatternId>("smptehdbars");
  const [format, setFormat] = useState<FormatId>("1080p5994");
  const [durationText, setDurationText] = useState(String(DEFAULT_DURATION_SEC));
  const [container, setContainer] = useState<ContainerId>("mp4");
  const [audio, setAudio] = useState<AudioMode>("tone-20");
  const [burnTimecode, setBurnTimecode] = useState(true);
  const [safeArea, setSafeArea] = useState(false);
  const [label, setLabel] = useState("");

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
    };
  }, [loadEngine]);

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
    return parts.join(" · ");
  }, [pattern, format, durationSec, audio, burnTimecode, safeArea, label, isLipsync]);

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
  }, [pattern, format, durationSec, container, audio, burnTimecode, label, safeArea, summary]);

  const handleCancel = useCallback(() => {
    engine.terminate();
    setRendering(false);
    setRenderError("Render cancelled.");
    void loadEngine();
  }, [loadEngine]);

  const busy = rendering || engineState === "loading";

  return {
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
    threadMode,
    engineError,
    loadEngine,
    rendering,
    progress,
    lastLog,
    renderError,
    file,
    durationSec,
    durationValid,
    isLipsync,
    summary,
    busy,
    handleGenerate,
    handleCancel,
  };
}

export type TestPatternEngine = ReturnType<typeof useTestPatternEngine>;
