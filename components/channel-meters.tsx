"use client";

import { useEffect, useRef, useState } from "react";
import {
  channelLabels,
  dbToFraction,
  layoutName,
  METER_WINDOW_SEC,
  rmsToDb,
} from "@/lib/audio-meter";

/**
 * Per-channel level meters for the preview. Decodes the rendered file once with
 * Web Audio (which exposes every discrete channel — unlike a MediaElementSource,
 * which the browser downmixes to stereo), then reads an RMS window around the
 * <video>'s playhead each frame. It never touches the element's own audio, so
 * playback is unaffected; the meters just visualize what each speaker carries —
 * enough to watch BLITS/EBU identify channels without a DAW.
 */
export function ChannelMeters({
  url,
  videoRef,
}: {
  url: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [channels, setChannels] = useState(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const fillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Decode the file once per url. decodeAudioData works on a suspended context
  // (no user-gesture needed) since nothing is routed to the speakers.
  useEffect(() => {
    let cancelled = false;
    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    void (async () => {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        const buf = await ac.decodeAudioData(data);
        if (cancelled) return;
        bufferRef.current = buf;
        setChannels(buf.numberOfChannels);
      } catch {
        if (!cancelled) {
          bufferRef.current = null;
          setChannels(0);
        }
      }
    })();
    return () => {
      cancelled = true;
      bufferRef.current = null;
      setChannels(0);
      void ac.close();
    };
  }, [url]);

  // Update the bars imperatively (no per-frame React re-render). Driven by a
  // ~30 fps timer rather than requestAnimationFrame: rAF is fully paused while
  // the tab is hidden, which would freeze the meter; a timer keeps updating
  // (browsers still fire it, throttled, when hidden) and 30 fps is plenty for a
  // level meter.
  useEffect(() => {
    if (!channels) return;
    const tick = () => {
      const buf = bufferRef.current;
      if (!buf) return;
      const v = videoRef.current;
      const sr = buf.sampleRate;
      const win = Math.round(sr * METER_WINDOW_SEC);
      const t = v ? v.currentTime : 0;
      const center = Math.min(buf.length - 1, Math.max(0, Math.floor(t * sr)));
      const start = Math.max(0, center - win);
      const end = Math.min(buf.length, center + win);
      const n = Math.max(1, end - start);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        let sum = 0;
        for (let i = start; i < end; i++) sum += d[i] * d[i];
        const db = rmsToDb(Math.sqrt(sum / n));
        const fill = fillRefs.current[c];
        if (fill) fill.style.width = `${dbToFraction(db) * 100}%`;
        const val = valRefs.current[c];
        if (val) val.textContent = Number.isFinite(db) ? `${Math.round(db)}` : "−∞";
      }
    };
    const id = window.setInterval(tick, 33);
    tick();
    return () => window.clearInterval(id);
  }, [channels, videoRef]);

  if (!channels) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Channel levels
        </span>
        <span className="text-[11px] text-muted-foreground/70">{layoutName(channels)} · dBFS</span>
      </div>
      {channelLabels(channels).map((lab, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-8 shrink-0 font-mono text-[11px] text-muted-foreground">{lab}</span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              ref={(el) => {
                fillRefs.current[i] = el;
              }}
              className="absolute inset-y-0 left-0 rounded-sm bg-[hsl(var(--primary))] transition-[width] duration-75"
              style={{ width: "0%" }}
            />
          </div>
          <span
            ref={(el) => {
              valRefs.current[i] = el;
            }}
            className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            −∞
          </span>
        </div>
      ))}
    </div>
  );
}
