import { describe, expect, it } from "vitest";

import {
  AUDIO_LAYOUTS,
  audioLayoutById,
  coerceRate,
  composeFormatId,
  FORMATS,
  formatById,
  MAX_DURATION_SEC,
  maxDurationSecFor,
  RATES,
  ratesForResolution,
  RESOLUTIONS,
} from "./presets";

describe("format matrix (RESOLUTIONS × RATES)", () => {
  it("generates unique ids for every combination", () => {
    const ids = FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the original format ids intact", () => {
    // These ids predate the matrix (they appear in shared filenames); the id
    // scheme must keep producing them.
    for (const id of ["1080p5994", "1080i5994", "720p5994"] as const) {
      expect(FORMATS.some((f) => f.id === id)).toBe(true);
    }
    expect(formatById("1080i5994").interlaced).toBe(true);
    expect(formatById("720p5994")).toMatchObject({ width: 1280, height: 720 });
  });

  it("offers interlaced rates only at 1080", () => {
    for (const res of RESOLUTIONS) {
      const rates = ratesForResolution(res.id);
      if (res.id === "1080") {
        expect(rates).toEqual(RATES);
      } else {
        expect(rates.every((r) => !r.interlaced)).toBe(true);
      }
    }
    expect(FORMATS.filter((f) => f.interlaced).map((f) => f.id)).toEqual([
      "1080i50",
      "1080i5994",
    ]);
  });

  it("marks drop-frame only on the 29.97/59.94 family", () => {
    const dropIds = RATES.filter((r) => r.dropFrame).map((r) => r.id);
    expect(dropIds).toEqual(["p2997", "p5994", "i5994"]);
  });

  it("composes ids the same way the matrix does", () => {
    expect(composeFormatId("1080", "i50")).toBe("1080i50");
    expect(formatById(composeFormatId("2160", "p25"))).toMatchObject({
      width: 3840,
      height: 2160,
      rate: "25",
    });
  });

  it("falls back to the default format for unknown ids", () => {
    // e.g. "720i50" composes structurally but isn't a generated combination
    expect(formatById(composeFormatId("720", "i50")).id).toBe("1080p5994");
  });

  it("output filenames use the id directly — label stripped of dots equals id", () => {
    // build-command names files by format.id; this pins the id/label relation
    // so a label change can never silently rename shared files.
    for (const f of FORMATS) {
      expect(f.label.replace(/\./g, "")).toBe(f.id);
    }
  });
});

describe("audio layouts", () => {
  it("offers stereo + multichannel line-ups with matching channel metadata", () => {
    expect(AUDIO_LAYOUTS.map((l) => l.id)).toEqual([
      "stereo",
      "stereo-intl",
      "ebu51",
      "blits51",
    ]);
    expect(audioLayoutById("stereo").channels).toBe(2);
    expect(audioLayoutById("ebu51").channels).toBe(6);
    expect(audioLayoutById("blits51").channelLayout).toBe("5.1");
  });

  it("single-quotes every aevalsrc so mod()/lt()/gt() commas survive the parser", () => {
    for (const l of AUDIO_LAYOUTS) {
      expect(l.buildAudio(0.1).startsWith("aevalsrc='")).toBe(true);
    }
  });

  it("emits one expr per channel for each layout", () => {
    for (const l of AUDIO_LAYOUTS) {
      const exprs = l.buildAudio(0.1).match(/aevalsrc='([^']*)'/)![1].split("|");
      expect(exprs).toHaveLength(l.channels);
    }
  });

  it("falls back to stereo for an unknown id", () => {
    expect(audioLayoutById("nope" as never).id).toBe("stereo");
  });
});

describe("coerceRate", () => {
  it("passes through rates the resolution offers", () => {
    expect(coerceRate("720", "p50")).toBe("p50");
    expect(coerceRate("1080", "i5994")).toBe("i5994");
  });

  it("falls back to the same-speed progressive rate when interlace is unavailable", () => {
    expect(coerceRate("720", "i50")).toBe("p50");
    expect(coerceRate("2160", "i5994")).toBe("p5994");
  });
});

describe("maxDurationSecFor (wasm memory budget)", () => {
  it("keeps the full range at 1080 and below", () => {
    expect(maxDurationSecFor(formatById("1080p5994"))).toBe(MAX_DURATION_SEC);
    expect(maxDurationSecFor(formatById("720p50"))).toBe(MAX_DURATION_SEC);
    expect(maxDurationSecFor(formatById("360p30"))).toBe(MAX_DURATION_SEC);
  });

  it("caps larger frames proportionally to their area", () => {
    expect(maxDurationSecFor(formatById("2160p25"))).toBe(75); // 4x 1080p area
    expect(maxDurationSecFor(formatById("1440p50"))).toBe(168);
  });
});
