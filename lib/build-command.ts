import {
  type AudioMode,
  type ContainerId,
  type FormatId,
  type PatternId,
  audioModeById,
  containerById,
  formatById,
  FONT_FS_PATH,
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
}

export interface BuiltCommand {
  args: string[];
  outputName: string;
  mimeType: string;
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
  // Both sources ride one lavfi input as separate output pads. Two -f lavfi
  // inputs deadlock ffmpeg.wasm's multi-threaded core (exec never returns);
  // a single input with [out0]/[out1] pads yields the same two streams.
  const lavfiInput = `${videoSource}[out0];${audioSource}[out1]`;

  const filters: string[] = [...pattern.buildPrefilters(format)];
  if (format.interlaced) {
    filters.push("interlace=scan=tff");
  }
  if (opts.burnTimecode) {
    filters.push(timecodeFilter(format.tcRate, format.height));
  }
  const label = opts.label.trim();
  if (label.length > 0) {
    filters.push(labelFilter(label, format.height));
  }
  if (opts.safeArea) {
    filters.push(...SAFE_AREA_FILTERS);
  }
  filters.push("format=yuv420p");

  const outputName = `${pattern.id}_${format.label.replace(/\./g, "")}_${duration}s.${container.extension}`;

  const args = [
    "-f", "lavfi", "-i", lavfiInput,
    "-vf", filters.join(","),
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "superfast",
    "-crf", "18",
    "-threads", "4",
    ...(format.interlaced ? ["-flags", "+ildct+ilme"] : []),
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
    "-c:a", "aac",
    "-b:a", "192k",
    ...(container.id === "mp4" ? ["-movflags", "+faststart"] : []),
    outputName,
  ];

  return { args, outputName, mimeType: container.mimeType };
}
