import { describe, expect, it } from "vitest";

import {
  channelLabels,
  dbToFraction,
  layoutName,
  METER_FLOOR_DB,
  rmsToDb,
} from "./audio-meter";

describe("channelLabels", () => {
  it("uses the 5.1 speaker order for six channels", () => {
    expect(channelLabels(6)).toEqual(["L", "R", "C", "LFE", "Ls", "Rs"]);
  });
  it("labels stereo and mono", () => {
    expect(channelLabels(2)).toEqual(["L", "R"]);
    expect(channelLabels(1)).toEqual(["M"]);
  });
  it("falls back to 1-based numbers for unknown counts", () => {
    expect(channelLabels(3)).toEqual(["1", "2", "3"]);
    expect(channelLabels(0)).toEqual([]);
  });
});

describe("layoutName", () => {
  it("names the common layouts", () => {
    expect(layoutName(6)).toBe("5.1");
    expect(layoutName(8)).toBe("7.1");
    expect(layoutName(2)).toBe("Stereo");
    expect(layoutName(1)).toBe("Mono");
    expect(layoutName(3)).toBe("3 ch");
  });
});

describe("rmsToDb", () => {
  it("converts linear RMS to dBFS", () => {
    expect(rmsToDb(1)).toBeCloseTo(0, 5);
    expect(rmsToDb(0.5)).toBeCloseTo(-6.0206, 3);
    // a -20 dBFS peak sine has RMS 0.0707
    expect(rmsToDb(0.0707)).toBeCloseTo(-23.01, 1);
  });
  it("returns -Infinity for (near-)silence", () => {
    expect(rmsToDb(0)).toBe(-Infinity);
    expect(rmsToDb(1e-7)).toBe(-Infinity);
  });
});

describe("dbToFraction", () => {
  it("maps the [floor, 0] range to [0, 1]", () => {
    expect(dbToFraction(0)).toBe(1);
    expect(dbToFraction(METER_FLOOR_DB)).toBe(0);
    expect(dbToFraction(METER_FLOOR_DB / 2)).toBeCloseTo(0.5, 5);
  });
  it("clamps out-of-range and non-finite levels to [0, 1]", () => {
    expect(dbToFraction(6)).toBe(1); // above full scale
    expect(dbToFraction(-120)).toBe(0); // below floor
    expect(dbToFraction(-Infinity)).toBe(0);
    expect(dbToFraction(NaN)).toBe(0);
  });
});
