import { describe, expect, it } from "vitest";

import {
  composeFormatId,
  FORMATS,
  formatById,
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
});
