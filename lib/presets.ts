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
export type FormatId = "1080p5994" | "1080i5994" | "720p5994";
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
      return (
        `color=c=0x141414:size=${f.width}x${f.height}:rate=${f.rate}[lsbg];` +
        `color=c=white:size=6x${barH}:rate=${f.rate}[lsbar];` +
        `[lsbg][lsbar]overlay=x='(main_w-6)*mod(t,1)':y='main_h*0.87':eval=frame`
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
      "Fast-moving vertical bar (8 px/frame) — wrong field order shows as back-and-forth judder",
    buildSource: (f) =>
      `color=c=black:size=${f.width}x${f.height}:rate=${f.rate}[fsbg];` +
      `color=c=white:size=12x${f.height}:rate=${f.rate}[fsbar];` +
      `[fsbg][fsbar]overlay=x='mod(n*8,main_w)':eval=frame`,
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

export const FORMATS: FormatDef[] = [
  {
    id: "1080p5994",
    label: "1080p59.94",
    width: 1920,
    height: 1080,
    rate: "60000/1001",
    interlaced: false,
    tcRate: "60000/1001",
  },
  {
    id: "1080i5994",
    label: "1080i59.94",
    width: 1920,
    height: 1080,
    rate: "60000/1001",
    interlaced: true,
    tcRate: "30000/1001",
  },
  {
    id: "720p5994",
    label: "720p59.94",
    width: 1280,
    height: 720,
    rate: "60000/1001",
    interlaced: false,
    tcRate: "60000/1001",
  },
];

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

export function patternById(id: PatternId): PatternDef {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

export function formatById(id: FormatId): FormatDef {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export function containerById(id: ContainerId): ContainerDef {
  return CONTAINERS.find((c) => c.id === id) ?? CONTAINERS[0];
}
