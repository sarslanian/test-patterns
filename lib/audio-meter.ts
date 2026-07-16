// Pure helpers for the preview channel-level meters. Kept out of the React
// component so they're unit-testable without a Web Audio / DOM environment.

/** Meter scale bottom, in dBFS. Levels at or below this read as empty. */
export const METER_FLOOR_DB = -60;

/** RMS integration window, in seconds, sampled around the playhead. */
export const METER_WINDOW_SEC = 0.05;

/**
 * Speaker labels for a decoded channel count. 5.1 follows the AAC/MOV order
 * (L R C LFE Ls Rs); unknown counts fall back to 1-based numbers.
 */
const LAYOUT_LABELS: Record<number, string[]> = {
  1: ["M"],
  2: ["L", "R"],
  6: ["L", "R", "C", "LFE", "Ls", "Rs"],
  8: ["L", "R", "C", "LFE", "Ls", "Rs", "Lb", "Rb"],
};

export function channelLabels(count: number): string[] {
  return LAYOUT_LABELS[count] ?? Array.from({ length: Math.max(0, count) }, (_, i) => `${i + 1}`);
}

/** Short name for a channel count, e.g. 6 → "5.1", 2 → "Stereo". */
export function layoutName(count: number): string {
  if (count === 6) return "5.1";
  if (count === 8) return "7.1";
  if (count === 2) return "Stereo";
  if (count === 1) return "Mono";
  return `${count} ch`;
}

/** Linear RMS → dBFS. Returns -Infinity for (near-)silence. */
export function rmsToDb(rms: number): number {
  return rms <= 1e-6 ? -Infinity : 20 * Math.log10(rms);
}

/**
 * Map a dBFS level to a 0–1 meter fill fraction over [floor, 0]. -Infinity and
 * anything at/under the floor read as 0; 0 dBFS (full scale) reads as 1.
 */
export function dbToFraction(db: number, floor: number = METER_FLOOR_DB): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - floor) / -floor));
}
