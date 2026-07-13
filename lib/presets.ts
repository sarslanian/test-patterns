export type PatternId =
  | "smptehdbars"
  | "smptebars"
  | "pal75bars"
  | "pal100bars"
  | "testsrc"
  | "lipsync"
  | "pluge"
  | "fieldsweep"
  | "flicker";
export type ResolutionId = "2160" | "1440" | "1080" | "720" | "540" | "360";
export type RateId =
  | "p2398"
  | "p24"
  | "p25"
  | "p2997"
  | "p30"
  | "p50"
  | "p5994"
  | "p60"
  | "i50"
  | "i5994";
/** Composed as `${ResolutionId}${RateId}`, e.g. "1080p5994", "1080i50". */
export type FormatId = `${ResolutionId}${RateId}`;
export type ContainerId = "mp4" | "mov" | "ts";
export type AudioMode = "tone-20" | "tone-18" | "tone-12" | "silence";

/** Path the burn-in font is written to inside ffmpeg's virtual FS */
export const FONT_FS_PATH = "font.ttf";

/** Quick-set preset id — labels a slot in LOGO_POSITIONS, not used elsewhere. */
type LogoPositionPreset = "tl" | "tr" | "center" | "bl" | "br";

/**
 * Quick-set presets. `x`/`y` are the horizontal/vertical placement percentages
 * the preset snaps the fine sliders to: 0 = flush to the safe edge, 50 =
 * centered, 100 = flush to the opposite safe edge (see overlayPosition).
 */
export const LOGO_POSITIONS: { id: LogoPositionPreset; label: string; x: number; y: number }[] = [
  { id: "tl", label: "Top L", x: 0, y: 0 },
  { id: "tr", label: "Top R", x: 100, y: 0 },
  { id: "center", label: "Center", x: 50, y: 50 },
  { id: "bl", label: "Bot L", x: 0, y: 100 },
  { id: "br", label: "Bot R", x: 100, y: 100 },
];

/** Default placement: bottom-right, matching the initial preset. */
export const LOGO_POS_DEFAULT = { x: 100, y: 100 } as const;

/** Accepted logo image MIME types (raster only — the wasm core has no SVG rasterizer) */
export const LOGO_ACCEPT = "image/png,image/jpeg";
/** Reject uploads larger than this — the wasm core is memory-tight */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export const LOGO_SIZE_PCT = { min: 5, max: 40, default: 15 } as const;
export const LOGO_OPACITY_PCT = { min: 20, max: 100, default: 100 } as const;
/** Logo inset from the frame edge, as a percentage of frame width */
export const LOGO_MARGIN_PCT = 3;

export interface LogoOptions {
  /** Raw image bytes, written to the virtual FS per render */
  data: Uint8Array;
  /** File extension for the FS filename (e.g. "png", "jpg") */
  ext: string;
  /** Horizontal placement across the safe area: 0 = left edge, 100 = right */
  xPct: number;
  /** Vertical placement across the safe area: 0 = top edge, 100 = bottom */
  yPct: number;
  /** Logo width as a percentage of frame width */
  sizePct: number;
  /** Alpha multiplier, 0–1 */
  opacity: number;
}

/** Path an uploaded logo is written to inside ffmpeg's virtual FS */
export function logoFsPath(ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `logo.${clean || "png"}`;
}

export interface AudioModeDef {
  id: AudioMode;
  label: string;
  /** Linear peak amplitude of the 1 kHz sine (10^(dBFS/20)); null = silence */
  amplitude: number | null;
}

export const AUDIO_MODES: AudioModeDef[] = [
  { id: "tone-20", label: "−20 dBFS", amplitude: 0.1 },
  { id: "tone-18", label: "−18 dBFS", amplitude: 0.125892541 },
  { id: "tone-12", label: "−12 dBFS", amplitude: 0.251188643 },
  { id: "silence", label: "Silence", amplitude: null },
];

export function audioModeById(id: AudioMode): AudioModeDef {
  return AUDIO_MODES.find((a) => a.id === id) ?? AUDIO_MODES[0];
}

/** Sample rate for every generated audio source. */
const AUDIO_SR = 48000;
/** A sine at linear peak `a` and frequency `f` (default 1 kHz), as a lavfi expr. */
const tone = (a: number, f = 1000) => `${a}*sin(2*PI*${f}*t)`;

/**
 * Channel layout / line-up content — the axis orthogonal to level. The level
 * (−20/−18/−12 dBFS or silence) is chosen separately; here you pick how many
 * channels and what identification content they carry.
 */
export type AudioLayoutId = "stereo" | "stereo-intl" | "ebu51" | "blits51";

export interface AudioLayoutDef {
  id: AudioLayoutId;
  /** Full label for the dropdown */
  label: string;
  /** Compact tag for the one-line summaries, e.g. "5.1 BLITS" */
  shortLabel: string;
  /** ffmpeg channel_layout for both the source and silence (e.g. "stereo", "5.1") */
  channelLayout: string;
  /** Channel count, matching channelLayout — informational (UI/tests) */
  channels: number;
  /** AAC target bitrate, scaled to the channel count */
  bitrate: string;
  /**
   * lavfi audio source for a reference signal at linear peak `amplitude`. The
   * exprs are single-quoted so the commas inside mod()/lt()/gt() survive the
   * filter option parser (an unquoted comma is read as an option separator).
   */
  buildAudio(amplitude: number): string;
}

// 5.1 channel order is L R C LFE Ls Rs.
export const AUDIO_LAYOUTS: AudioLayoutDef[] = [
  {
    id: "stereo",
    label: "Stereo — 1 kHz L+R",
    shortLabel: "Stereo",
    channelLayout: "stereo",
    channels: 2,
    bitrate: "192k",
    buildAudio: (a) => `aevalsrc='${tone(a)}|${tone(a)}':s=${AUDIO_SR}`,
  },
  {
    id: "stereo-intl",
    label: "Stereo — intermittent left",
    shortLabel: "intermittent L",
    channelLayout: "stereo",
    channels: 2,
    bitrate: "192k",
    // Left pulses on for 1.5 s of every 3 s, right steady — identifies L vs R
    // (and a swapped pair) by ear without watching a meter.
    buildAudio: (a) => `aevalsrc='${tone(a)}*lt(mod(t,3),1.5)|${tone(a)}':s=${AUDIO_SR}`,
  },
  {
    id: "ebu51",
    label: "5.1 — EBU line-up (1 kHz)",
    shortLabel: "5.1 EBU",
    channelLayout: "5.1",
    channels: 6,
    bitrate: "384k",
    // Steady 1 kHz on the five main channels, LFE silent — the standard EBU
    // line-up reference for checking a 5.1 chain is mapped and passing tone.
    buildAudio: (a) => {
      const s = tone(a);
      return `aevalsrc='${s}|${s}|${s}|0|${s}|${s}':c=5.1:s=${AUDIO_SR}`;
    },
  },
  {
    id: "blits51",
    label: "5.1 — BLITS identification",
    shortLabel: "5.1 BLITS",
    channelLayout: "5.1",
    channels: 6,
    bitrate: "384k",
    // Practical BLITS-style identification loop (6 s): a 1 kHz line-up on the
    // five main channels for 2 s, then a sequence of per-channel bursts so each
    // speaker can be identified in turn, with a 50 Hz burst for the LFE. Not
    // bit-exact to EBU Tech 3304 timings, but correct for channel-mapping checks.
    buildAudio: (a) => {
      const s = tone(a);
      const s50 = tone(a, 50);
      const T = "mod(t,6)";
      const lineup = `lt(${T},2)`; // all main channels during the first 2 s
      const slot = (x: number, y: number) => `gt(${T},${x})*lt(${T},${y})`;
      const ch = [
        `${s}*(${lineup}+${slot(2, 2.6)})`, // L
        `${s}*(${lineup}+${slot(2.6, 3.2)})`, // R
        `${s}*(${lineup}+${slot(3.2, 3.8)})`, // C
        `${s50}*(${slot(3.8, 4.4)})`, // LFE (50 Hz)
        `${s}*(${lineup}+${slot(4.4, 5)})`, // Ls
        `${s}*(${lineup}+${slot(5, 5.6)})`, // Rs
      ];
      return `aevalsrc='${ch.join("|")}':c=5.1:s=${AUDIO_SR}`;
    },
  },
];

export const DEFAULT_AUDIO_LAYOUT: AudioLayoutId = "stereo";

export function audioLayoutById(id: AudioLayoutId): AudioLayoutDef {
  return AUDIO_LAYOUTS.find((l) => l.id === id) ?? AUDIO_LAYOUTS[0];
}

export interface ResolutionDef {
  id: ResolutionId;
  label: string;
  width: number;
  height: number;
}

export interface RateDef {
  id: RateId;
  /** Rate as shown in the UI dropdown, e.g. "59.94p", "50i" */
  label: string;
  /** Numeric part of the label, used to compose format labels ("59.94") */
  fpsLabel: string;
  /** lavfi source rate (progressive frame rate before any interlacing) */
  rate: string;
  interlaced: boolean;
  /** drawtext timecode_rate — frame rate the burned timecode counts at */
  tcRate: string;
  /** SMPTE drop-frame counting (29.97/59.94 family only) */
  dropFrame: boolean;
}

export interface FormatDef {
  id: FormatId;
  label: string;
  width: number;
  height: number;
  /** lavfi source rate (progressive frame rate before any interlacing) */
  rate: string;
  interlaced: boolean;
  /** drawtext timecode_rate — frame rate the burned timecode counts at */
  tcRate: string;
  /** SMPTE drop-frame timecode counting (29.97/59.94 family only) */
  dropFrame: boolean;
}

export interface PatternDef {
  id: PatternId;
  label: string;
  description: string;
  /** lavfi source string for the given output format */
  buildSource(format: FormatDef): string;
  /**
   * Filters that normalize the source to Rec.709 yuv420p before any burn-ins.
   * The sources are not uniform: smptehdbars bakes Rec.709 YCbCr natively;
   * smptebars and the PAL bars bake Rec.601 and need a matrix conversion;
   * testsrc (rgb24) and colorchart (gbrp) are RGB, where swscale would
   * otherwise pick bt601 coefficients for the RGB→YUV conversion.
   */
  buildPrefilters(format: FormatDef): string[];
  /**
   * Pattern-driven audio (e.g. the lip-sync beep), overriding the selected
   * tone/silence mode. Receives the linear peak amplitude of the selected
   * tone level so the pattern's audio still honors it.
   */
  buildAudio?(amplitude: number): string;
}

const sizedSource = (name: string) => (f: FormatDef) =>
  `${name}=size=${f.width}x${f.height}:rate=${f.rate}`;

const BARS_601_TO_709 = () => ["colormatrix=bt601:bt709"];

export const PATTERNS: PatternDef[] = [
  {
    id: "smptehdbars",
    label: "HD SMPTE bars",
    description: "SMPTE RP 219 HD color bars",
    buildSource: sizedSource("smptehdbars"),
    buildPrefilters: () => [],
  },
  {
    id: "smptebars",
    label: "SMPTE bars",
    description: "Classic SMPTE EG 1 color bars",
    buildSource: sizedSource("smptebars"),
    buildPrefilters: BARS_601_TO_709,
  },
  {
    id: "pal75bars",
    label: "PAL 75%",
    description: "PAL/EBU 75% color bars",
    buildSource: sizedSource("pal75bars"),
    buildPrefilters: BARS_601_TO_709,
  },
  {
    id: "pal100bars",
    label: "PAL 100%",
    description: "PAL/EBU 100% full-saturation color bars",
    buildSource: sizedSource("pal100bars"),
    buildPrefilters: BARS_601_TO_709,
  },
  {
    id: "testsrc",
    label: "Moving pattern",
    description: "testsrc — scrolling gradient + counter, catches frozen frames",
    buildSource: sizedSource("testsrc"),
    buildPrefilters: () => ["scale=out_color_matrix=bt709", "format=yuv420p"],
  },
  {
    id: "lipsync",
    label: "Lip sync",
    description:
      "White flash + 1 kHz beep every second — A/V offset shows as flash/beep separation",
    // Dark background with a sweep bar that restarts (left edge) exactly on
    // the flash/beep second. Moving elements use overlay eval=frame; drawbox
    // only carries constant geometry + timeline enable.
    buildSource: (f) => {
      const barH = Math.round(f.height * 0.06);
      // Bar width scales with the frame (6 px at 1920) so it stays visible at
      // UHD and after downscaled playback.
      const barW = Math.max(4, Math.round(f.width / 320));
      return (
        `color=c=0x141414:size=${f.width}x${f.height}:rate=${f.rate}[lsbg];` +
        `color=c=white:size=${barW}x${barH}:rate=${f.rate}[lsbar];` +
        `[lsbg][lsbar]overlay=x='(main_w-${barW})*mod(t,1)':y='main_h*0.87':eval=frame`
      );
    },
    buildPrefilters: () => [
      "format=yuv420p",
      "drawbox=x='(iw-ih*0.3)/2':y='ih*0.35':w='ih*0.3':h='ih*0.3':color=gray@0.9:thickness=4",
      "drawbox=x='(iw-ih*0.26)/2':y='ih*0.37':w='ih*0.26':h='ih*0.26':color=white:thickness=fill:enable='lt(mod(t,1),0.1)'",
    ],
    // 100 ms beep at the top of every second, same instant as the flash.
    buildAudio: (a) =>
      `aevalsrc='${a}*sin(2*PI*1000*t)*lt(mod(t,1),0.1)|${a}*sin(2*PI*1000*t)*lt(mod(t,1),0.1)':s=48000`,
  },
  {
    id: "pluge",
    label: "PLUGE",
    description:
      "Near-black steps (−2 / 0 / +2 / +4%) + 75% white reference — black-level and super-black clipping check",
    // geq writes exact code values (super-black 11 can't be expressed via
    // RGB-parsed colors) but is per-pixel slow — so the static frame is built
    // at 1 fps and duplicated up to the output rate with fps. Labels render
    // pre-fps for the same reason; burn-ins (timecode) still run per frame.
    // (`loop=-1:size=1` was tried first: in the 5.1 wasm core it neither
    // stops upstream evaluation nor finishes — exits -1 mid-encode.)
    buildSource: (f) => `color=c=black:size=${f.width}x${f.height}:rate=1`,
    buildPrefilters: (f) => [
      "format=yuv420p",
      "geq=lum='if(lt(Y,H*0.15),180,if(between(Y,H*0.35,H*0.65),if(lt(X,W/4),11,if(lt(X,W/2),16,if(lt(X,3*W/4),21,26))),16))':cb=128:cr=128",
      ...["-2%", "0%", "+2%", "+4%"].map(
        (txt, i) =>
          `drawtext=fontfile=${FONT_FS_PATH}:expansion=none:text='${txt}':fontsize=${Math.round(f.height / 30)}:fontcolor=gray:x=w*${2 * i + 1}/8-text_w/2:y=h*0.68`
      ),
      `fps=${f.rate}`,
    ],
  },
  {
    id: "fieldsweep",
    label: "Field sweep",
    description:
      "Fast-moving vertical bar — wrong field order shows as back-and-forth judder",
    // Bar step/width scale with the frame (8 px/frame, 12 px bar at 1920) so
    // the sweep speed and visibility are the same fraction of the frame at
    // every resolution.
    buildSource: (f) => {
      const step = Math.max(2, Math.round(f.width / 240));
      const barW = Math.max(6, Math.round(f.width / 160));
      return (
        `color=c=black:size=${f.width}x${f.height}:rate=${f.rate}[fsbg];` +
        `color=c=white:size=${barW}x${f.height}:rate=${f.rate}[fsbar];` +
        `[fsbg][fsbar]overlay=x='mod(n*${step},main_w)':eval=frame`
      );
    },
    buildPrefilters: () => ["format=yuv420p"],
  },
  // NOTE: colorchart and zoneplate are intentionally absent — colorchart in
  // the ffmpeg 5.1-era wasm core hangs then faults (verified in-browser), and
  // zoneplate isn't compiled in at all (added in ffmpeg 6.0). Revisit if
  // @ffmpeg/core ships a newer ffmpeg.
  {
    id: "flicker",
    label: "Flicker",
    description:
      "Black/white alternating every frame — dropped or repeated frames show instantly",
    buildSource: (f) => `color=c=black:size=${f.width}x${f.height}:rate=${f.rate}`,
    buildPrefilters: () => [
      "format=yuv420p",
      "drawbox=color=white:thickness=fill:enable='eq(mod(n,2),1)'",
    ],
  },
];

export const RESOLUTIONS: ResolutionDef[] = [
  { id: "2160", label: "3840×2160 (UHD 4K)", width: 3840, height: 2160 },
  { id: "1440", label: "2560×1440 (QHD)", width: 2560, height: 1440 },
  { id: "1080", label: "1920×1080 (Full HD)", width: 1920, height: 1080 },
  { id: "720", label: "1280×720 (HD)", width: 1280, height: 720 },
  { id: "540", label: "960×540", width: 960, height: 540 },
  { id: "360", label: "640×360", width: 640, height: 360 },
];

// Fractional NTSC-family rates (29.97/59.94) count SMPTE drop-frame timecode;
// everything else — including 23.976, which has no drop-frame standard — counts
// non-drop. Interlaced rates source at the field rate; the interlace filter
// halves that to the frame rate, which is what the timecode counts at.
const RATE_ROWS: Omit<RateDef, "label">[] = [
  { id: "p2398", fpsLabel: "23.98", rate: "24000/1001", interlaced: false, tcRate: "24000/1001", dropFrame: false },
  { id: "p24", fpsLabel: "24", rate: "24", interlaced: false, tcRate: "24", dropFrame: false },
  { id: "p25", fpsLabel: "25", rate: "25", interlaced: false, tcRate: "25", dropFrame: false },
  { id: "p2997", fpsLabel: "29.97", rate: "30000/1001", interlaced: false, tcRate: "30000/1001", dropFrame: true },
  { id: "p30", fpsLabel: "30", rate: "30", interlaced: false, tcRate: "30", dropFrame: false },
  { id: "p50", fpsLabel: "50", rate: "50", interlaced: false, tcRate: "50", dropFrame: false },
  { id: "p5994", fpsLabel: "59.94", rate: "60000/1001", interlaced: false, tcRate: "60000/1001", dropFrame: true },
  { id: "p60", fpsLabel: "60", rate: "60", interlaced: false, tcRate: "60", dropFrame: false },
  { id: "i50", fpsLabel: "50", rate: "50", interlaced: true, tcRate: "25", dropFrame: false },
  { id: "i5994", fpsLabel: "59.94", rate: "60000/1001", interlaced: true, tcRate: "30000/1001", dropFrame: true },
];

export const RATES: RateDef[] = RATE_ROWS.map((r) => ({
  ...r,
  label: `${r.fpsLabel}${r.interlaced ? "i" : "p"}`,
}));

/** Interlaced scanning is only a broadcast standard at 1080 (1080i50/1080i59.94). */
export function ratesForResolution(res: ResolutionId): RateDef[] {
  return res === "1080" ? RATES : RATES.filter((r) => !r.interlaced);
}

/** Compose the canonical format id, e.g. ("1080", "i5994") → "1080i5994". */
export function composeFormatId(res: ResolutionId, rate: RateId): FormatId {
  return `${res}${rate}`;
}

/** Every valid resolution × rate combination (interlaced limited to 1080). */
export const FORMATS: FormatDef[] = RESOLUTIONS.flatMap((res) =>
  ratesForResolution(res.id).map((r) => ({
    id: composeFormatId(res.id, r.id),
    // Broadcast-style label, e.g. "1080p59.94", "1080i50", "2160p25"
    label: `${res.id}${r.interlaced ? "i" : "p"}${r.fpsLabel}`,
    width: res.width,
    height: res.height,
    rate: r.rate,
    interlaced: r.interlaced,
    tcRate: r.tcRate,
    dropFrame: r.dropFrame,
  }))
);

export interface ContainerDef {
  id: ContainerId;
  label: string;
  extension: string;
  mimeType: string;
  /**
   * Whether a browser `<video>` element can play the container. MPEG-TS can't
   * be played natively (would need MSE + a demuxer like hls.js), so the UI
   * offers download only for it.
   */
  previewable: boolean;
}

export const CONTAINERS: ContainerDef[] = [
  { id: "mp4", label: "MP4", extension: "mp4", mimeType: "video/mp4", previewable: true },
  { id: "mov", label: "MOV", extension: "mov", mimeType: "video/quicktime", previewable: true },
  // MPEG-TS: H.264/AAC elementary streams for SRT/UDP ingest testing. The
  // muxer auto-applies annexb start codes; no bitstream filter needed.
  { id: "ts", label: "MPEG-TS", extension: "ts", mimeType: "video/mp2t", previewable: false },
];

export const MIN_DURATION_SEC = 1;
export const MAX_DURATION_SEC = 300;
export const DEFAULT_DURATION_SEC = 30;

export const DEFAULT_RESOLUTION: ResolutionId = "1080";
export const DEFAULT_RATE: RateId = "p5994";
const DEFAULT_FORMAT: FormatId = composeFormatId(DEFAULT_RESOLUTION, DEFAULT_RATE);

/** Resolve a default def at module load so a bad default fails loudly here. */
function defaultDef<T extends { id: string }>(defs: T[], id: string, kind: string): T {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Default ${kind} "${id}" is not in the generated set`);
  return def;
}
const DEFAULT_RATE_DEF = defaultDef(RATES, DEFAULT_RATE, "rate");
const DEFAULT_FORMAT_DEF = defaultDef(FORMATS, DEFAULT_FORMAT, "format");

/**
 * Pixel-seconds render budget, calibrated so 1080p keeps the full duration
 * range. Larger frames get proportionally less: the multi-threaded wasm core
 * has a fixed 1 GiB heap, and both the encoder's in-flight frame buffers and
 * the MEMFS-held output grow with frame area (2160 caps at 75 s, 1440 at 168 s).
 */
const PIXEL_SECONDS_BUDGET = 1920 * 1080 * MAX_DURATION_SEC;

export function maxDurationSecFor(format: FormatDef): number {
  const cap = Math.floor(PIXEL_SECONDS_BUDGET / (format.width * format.height));
  return Math.max(MIN_DURATION_SEC, Math.min(MAX_DURATION_SEC, cap));
}

/**
 * Valid rate for a resolution: the rate itself when offered there, otherwise
 * the rate at the same speed with the other scan (i50 → p50), otherwise the
 * default. Keeps resolution × rate combinations inside the generated matrix.
 */
export function coerceRate(res: ResolutionId, rate: RateId): RateId {
  const rates = ratesForResolution(res);
  if (rates.some((r) => r.id === rate)) return rate;
  const fps = rateById(rate).fpsLabel;
  return rates.find((r) => r.fpsLabel === fps)?.id ?? DEFAULT_RATE;
}

export function patternById(id: PatternId): PatternDef {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

export function formatById(id: FormatId): FormatDef {
  return FORMATS.find((f) => f.id === id) ?? DEFAULT_FORMAT_DEF;
}

export function rateById(id: RateId): RateDef {
  return RATES.find((r) => r.id === id) ?? DEFAULT_RATE_DEF;
}

export function containerById(id: ContainerId): ContainerDef {
  return CONTAINERS.find((c) => c.id === id) ?? CONTAINERS[0];
}
