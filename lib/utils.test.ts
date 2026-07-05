import { describe, expect, it } from "vitest";

import { sanitizeFileName, splitExtension } from "./utils";

describe("sanitizeFileName", () => {
  it("passes through an already-valid name", () => {
    expect(sanitizeFileName("GAME 4 SRT TEST")).toBe("GAME 4 SRT TEST");
  });

  it("strips filesystem-invalid characters", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("strips control characters", () => {
    expect(sanitizeFileName("a\x00b\x1fc")).toBe("abc");
  });

  it("leaves internal spaces and unicode intact", () => {
    expect(sanitizeFileName("café ★ 中文")).toBe("café ★ 中文");
  });

  it("does not trim surrounding whitespace (caller decides)", () => {
    expect(sanitizeFileName("  spaced  ")).toBe("  spaced  ");
  });
});

describe("splitExtension", () => {
  it("splits a normal name.ext", () => {
    expect(splitExtension("smptehdbars_1080p5994_30s.mp4")).toEqual({
      base: "smptehdbars_1080p5994_30s",
      ext: "mp4",
    });
  });

  it("treats a leading dot as having no extension (dotfile)", () => {
    expect(splitExtension(".gitignore")).toEqual({ base: ".gitignore", ext: "" });
  });

  it("returns no extension when there is no dot", () => {
    expect(splitExtension("noext")).toEqual({ base: "noext", ext: "" });
  });

  it("uses the last dot for a multi-dot name", () => {
    expect(splitExtension("a.b.c.mov")).toEqual({ base: "a.b.c", ext: "mov" });
  });

  it("round-trips with buildCommand's output naming convention", () => {
    const { base, ext } = splitExtension("testsrc_720p5994_12s.ts");
    expect(`${base}.${ext}`).toBe("testsrc_720p5994_12s.ts");
  });
});
