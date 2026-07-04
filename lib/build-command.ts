import {
  type AudioMode,
  type ContainerId,
  type FormatId,
  type LogoOptions,
  type PatternId,
  audioModeById,
  containerById,
  formatById,
  FONT_FS_PATH,
  LOGO_MARGIN_PCT,
  LOGO_OPACITY_PCT,
  LOGO_SIZE_PCT,
  logoFsPath,
  MAX_DURATION_SEC,
  MIN_DURATION_SEC,
  patternById,
} from "./presets";

export { FONT_FS_PATH };

export interface GenerateOptions {
  pattern: PatternId;
  format: FormatId;
  durationSec: number;
  container: ContainerId;
  audio: AudioMode;
  burnTimecode: boolean;
  /** Custom overlay label; empty string = no label */
  label: string;
  /** Burn action-safe (93%) / title-safe (90%) boxes + center cross */
  safeArea: boolean;
  /** Uploaded logo to composite over the pattern; omit for none */
  logo?: LogoOptions;
}

export interface BuiltCommand {
  /** One or two ffmpeg invocations, run in order. Two when a logo is overlaid. */
  passes: string[][];
  /** Name the final pass writes and the caller reads back. */
  outputName: string;
  mimeType: string;
  /** Intermediate FS files to delete after the final pass (currently unused). */
  intermediateNames: string[];
}

/** SMPTE ST 2046-1 HD safe areas: 93% action, 90% title, plus center cross */
const SAFE_AREA_FILTERS = [
  "drawbox=x='iw*0.035':y='ih*0.035':w='iw*0.93':h='ih*0.93':color=white@0.6:thickness=3",
  "drawbox=x='iw*0.05':y='ih*0.05':w='iw*0.9':h='ih*0.9':color=white@0.35:thickness=3",
  "drawbox=x='iw/2-1':y='ih/2-ih*0.04':w=2:h='ih*0.08':color=white@0.6:thickness=fill",
  "drawbox=x='iw/2-iw*0.025':y='ih/2-1':w='iw*0.05':h=2:color=white@0.6:thickness=fill",
];

/**
 * Quote a value for use inside a filtergraph option (e.g. drawtext text=…).
 * Filter args are parsed twice — once by the graph parser (strips one level of
 * quotes/escapes) and once by the option parser (splits on ':') — so the value
 * is wrapped in quotes for the first pass with backslash escapes surviving for
 * the second. Literal single quotes must leave the quoted span: '\'' at the
 * graph level, with the resulting quote re-escaped for the option parser.
 */
export function escapeFilterValue(value: string): string {
  const inner = value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "'\\\\\\''");
  return `'${inner}'`;
}

function timecodeFilter(tcRate: string, height: number): string {
  const fontsize = Math.round(height / 15);
  const border = Math.max(6, Math.round(height / 90));
  return [
    `drawtext=fontfile=${FONT_FS_PATH}`,
    // 59.94/29.97 family — drop-frame timecode, ';' frame separator
    `timecode=${escapeFilterValue("00:00:00;00")}`,
    `timecode_rate=${tcRate}`,
    `fontsize=${fontsize}`,
    "fontcolor=white",
    "box=1",
    "boxcolor=black@0.65",
    `boxborderw=${border}`,
    "x=(w-text_w)/2",
    "y=h*0.75-text_h/2",
  ].join(":");
}

function labelFilter(text: string, height: number): string {
  const fontsize = Math.round(height / 22);
  const border = Math.max(5, Math.round(height / 108));
  return [
    `drawtext=fontfile=${FONT_FS_PATH}`,
    // expansion=none: user text is literal, no %{...} sequences
    "expansion=none",
    `text=${escapeFilterValue(text)}`,
    `fontsize=${fontsize}`,
    "fontcolor=white",
    "box=1",
    "boxcolor=black@0.65",
    `boxborderw=${border}`,
    "x=(w-text_w)/2",
    "y=h*0.08",
  ].join(":");
}

export function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_DURATION_SEC;
  return Math.min(MAX_DURATION_SEC, Math.max(MIN_DURATION_SEC, Math.round(seconds)));
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * overlay x:y expression for a placement percentage on each axis. Travel is
 * inset by `margin` px on both sides, so 0 sits `margin` from the top/left
 * edge, 100 sits `margin` from the bottom/right, and 50 is centered (the
 * margins cancel). Percentages are kept as integer arithmetic in the filter.
 */
function overlayPosition(xPct: number, yPct: number, margin: number): string {
  const x = `${margin}+(main_w-overlay_w-${2 * margin})*${xPct}/100`;
  const y = `${margin}+(main_h-overlay_h-${2 * margin})*${yPct}/100`;
  return `x=${x}:y=${y}`;
}

export function buildCommand(opts: GenerateOptions): BuiltCommand {
  const pattern = patternById(opts.pattern);
  const format = formatById(opts.format);
  const container = containerById(opts.container);
  const duration = clampDuration(opts.durationSec);

  const videoSource = pattern.buildSource(format);
  // 1 kHz sine at an exact linear peak amplitude, stereo. (The `sine` source
  // is NOT full scale — it peaks at -18 dBFS — so aevalsrc with an explicit
  // amplitude is used instead.) Patterns with their own audio (lip-sync beep)
  // override the mode but keep the selected level; silence falls back to the
  // -20 dBFS amplitude there, since a silent lip-sync test is meaningless.
  const amplitude = audioModeById(opts.audio).amplitude;
  const audioSource = pattern.buildAudio
    ? pattern.buildAudio(amplitude ?? 0.1)
    : amplitude != null
      ? `aevalsrc=${amplitude}*sin(2*PI*1000*t)|${amplitude}*sin(2*PI*1000*t):s=48000`
      : "anullsrc=r=48000:cl=stereo";
  // Pattern normalization + interlacing, before any logo is composited.
  const preOverlay: string[] = [...pattern.buildPrefilters(format)];
  if (format.interlaced) {
    preOverlay.push("interlace=scan=tff");
  }
  // Burn-ins sit ON TOP of the logo so timecode/label/safe-area stay legible.
  const burnIns: string[] = [];
  if (opts.burnTimecode) {
    burnIns.push(timecodeFilter(format.tcRate, format.height));
  }
  const label = opts.label.trim();
  if (label.length > 0) {
    burnIns.push(labelFilter(label, format.height));
  }
  if (opts.safeArea) {
    burnIns.push(...SAFE_AREA_FILTERS);
  }

  // Both sources ride one lavfi input as separate output pads. Two -f lavfi
  // inputs deadlock ffmpeg.wasm's multi-threaded core (exec never returns);
  // a single input with [out0]/[out1] pads yields the same two streams.
  const lavfiInput = `${videoSource}[out0];${audioSource}[out1]`;

  const outputName = `${pattern.id}_${format.label.replace(/\./g, "")}_${duration}s.${container.extension}`;

  const encodeVideo = [
    "-c:v", "libx264",
    "-preset", "superfast",
    "-crf", "18",
    "-threads", "4",
    ...(format.interlaced ? ["-flags", "+ildct+ilme"] : []),
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
  ];
  const encodeAudio = ["-c:a", "aac", "-b:a", "192k"];
  const faststart = container.id === "mp4" ? ["-movflags", "+faststart"] : [];

  // No logo: single lavfi input + a linear -vf chain (the fast path).
  if (!opts.logo) {
    const args = [
      "-f", "lavfi", "-i", lavfiInput,
      "-vf", [...preOverlay, ...burnIns, "format=yuv420p"].join(","),
      "-t", String(duration),
      ...encodeVideo,
      ...encodeAudio,
      ...faststart,
      outputName,
    ];
    return { passes: [args], outputName, mimeType: container.mimeType, intermediateNames: [] };
  }

  // Logo: the pattern (0:v) and the logo image (input 1) are composited in a
  // filter_complex — pattern → prefilters → overlay(logo) → burn-ins. This
  // combines two inputs into one graph, which deadlocks the MT core, so the
  // caller runs logo renders on the single-threaded core (see ffmpeg-client).
  const logo = opts.logo;
  const sizePct = clamp(logo.sizePct, LOGO_SIZE_PCT.min, LOGO_SIZE_PCT.max, LOGO_SIZE_PCT.default);
  const opacity = clamp(logo.opacity, LOGO_OPACITY_PCT.min / 100, 1, 1);
  const xPct = Math.round(clamp(logo.xPct, 0, 100, 100));
  const yPct = Math.round(clamp(logo.yPct, 0, 100, 100));
  const logoW = Math.round((format.width * sizePct) / 100);
  const margin = Math.round((format.width * LOGO_MARGIN_PCT) / 100);

  // Scale the logo, and — only when translucent — pull its alpha down so the
  // whole mark fades. overlay blends in yuv420 (still honoring the logo's
  // alpha); format=auto would force a slow full-frame rgba conversion.
  const logoChain = [`scale=${logoW}:-1`];
  if (opacity < 1) {
    logoChain.push("format=rgba", `colorchannelmixer=aa=${opacity}`);
  }
  // `-loop 1` on the image input makes the still logo a continuous stream;
  // overlay shortest=1 ends the graph when the finite pattern stream would
  // (bounded by -t). Prefilters run ahead of the overlay so the bars' 601→709
  // matrix doesn't recolor the logo. Empty prefilters → overlay reads [0:v].
  const segments: string[] = [];
  let baseLabel = "[0:v]";
  if (preOverlay.length > 0) {
    segments.push(`[0:v]${preOverlay.join(",")}[base]`);
    baseLabel = "[base]";
  }
  segments.push(`[1:v]${logoChain.join(",")}[lg]`);
  segments.push(
    `${baseLabel}[lg]overlay=${overlayPosition(xPct, yPct, margin)}:format=yuv420:shortest=1[ov]`
  );
  segments.push(`[ov]${[...burnIns, "format=yuv420p"].join(",")}[v]`);

  const args = [
    "-f", "lavfi", "-i", lavfiInput,
    "-loop", "1", "-i", logoFsPath(logo.ext),
    "-filter_complex", segments.join(";"),
    "-map", "[v]",
    "-map", "0:a",
    "-t", String(duration),
    ...encodeVideo,
    ...encodeAudio,
    ...faststart,
    outputName,
  ];

  return { passes: [args], outputName, mimeType: container.mimeType, intermediateNames: [] };
}
