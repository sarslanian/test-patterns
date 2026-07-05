import { describe, expect, it } from "vitest";

import {
  buildCommand,
  clampDuration,
  escapeFilterValue,
  logoLayoutFractions,
  type GenerateOptions,
} from "./build-command";
import { type LogoOptions, LOGO_POSITIONS, MAX_DURATION_SEC, MIN_DURATION_SEC } from "./presets";

/** Minimal valid options; override per test. */
function opts(over: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    pattern: "smptehdbars",
    format: "1080p5994",
    durationSec: 30,
    container: "mp4",
    audio: "tone-20",
    burnTimecode: false,
    label: "",
    safeArea: false,
    ...over,
  };
}

function logo(over: Partial<LogoOptions> = {}): LogoOptions {
  return {
    data: new Uint8Array([1, 2, 3]),
    ext: "png",
    xPct: 100,
    yPct: 100,
    sizePct: 15,
    opacity: 1,
    ...over,
  };
}

/** Count occurrences of an exact arg token. */
const countArg = (args: string[], token: string) => args.filter((a) => a === token).length;

describe("buildCommand — no-logo fast path", () => {
  it("uses a single lavfi input and a -vf chain (MT-safe shape)", () => {
    const { args } = buildCommand(opts());
    // Exactly one input, no second input, no filter_complex — the multi-thread
    // core deadlocks on any two-input graph, so this path must stay single-input.
    expect(countArg(args, "-i")).toBe(1);
    expect(args).toContain("-vf");
    expect(args).not.toContain("-filter_complex");
    expect(args).not.toContain("-loop");
  });

  it("fuses the two sources into one lavfi input with [out0]/[out1] pads", () => {
    const args = buildCommand(opts()).args;
    const input = args[args.indexOf("-i") + 1];
    expect(input).toContain("[out0]");
    expect(input).toContain("[out1]");
    // one -f lavfi input only
    expect(countArg(args, "-f")).toBe(1);
  });

  it("orders filters: prefilters → burn-ins → format=yuv420p", () => {
    const args = buildCommand(
      opts({ pattern: "testsrc", burnTimecode: true, label: "HELLO", safeArea: true })
    ).args;
    const vf = args[args.indexOf("-vf") + 1];
    const tc = vf.indexOf("timecode");
    const lbl = vf.indexOf("HELLO");
    const fmt = vf.lastIndexOf("format=yuv420p");
    expect(vf.startsWith("scale=out_color_matrix=bt709")).toBe(true); // testsrc prefilter first
    expect(tc).toBeGreaterThan(0);
    expect(lbl).toBeGreaterThan(tc); // label after timecode
    expect(fmt).toBeGreaterThan(lbl); // format conversion last
  });

  it("adds interlace filter and interlaced coding flags for 1080i", () => {
    const args = buildCommand(opts({ format: "1080i5994" })).args;
    expect(args[args.indexOf("-vf") + 1]).toContain("interlace=scan=tff");
    expect(args.join(" ")).toContain("-flags +ildct+ilme");
  });

  it("omits burn-ins when disabled", () => {
    const vf = buildCommand(opts()).args[
      buildCommand(opts()).args.indexOf("-vf") + 1
    ];
    expect(vf).not.toContain("timecode");
    expect(vf).not.toContain("drawtext");
  });
});

describe("buildCommand — logo overlay path", () => {
  it("uses a second looped image input composited via filter_complex", () => {
    const { args } = buildCommand(opts({ logo: logo() }));
    expect(countArg(args, "-i")).toBe(2); // lavfi + logo
    expect(args.join(" ")).toContain("-loop 1 -i logo.png");
    expect(args).toContain("-filter_complex");
    expect(args).not.toContain("-vf");
    // maps the filtered video and the lavfi audio pad
    expect(args.join(" ")).toContain("-map [v]");
    expect(args.join(" ")).toContain("-map 0:a");
  });

  it("scales the logo relative to frame width and overlays in yuv420", () => {
    const fc = buildCommand(opts({ logo: logo({ sizePct: 15 }) })).args;
    const graph = fc[fc.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[1:v]scale=288:-1[lg]"); // 1920 * 0.15
    expect(graph).toContain("overlay=");
    expect(graph).toContain(":format=yuv420:shortest=1");
    expect(graph.endsWith("format=yuv420p[v]")).toBe(true);
  });

  it("runs prefilters before the overlay and burn-ins after it", () => {
    const fc = buildCommand(
      opts({ pattern: "testsrc", burnTimecode: true, logo: logo() })
    ).args;
    const graph = fc[fc.indexOf("-filter_complex") + 1];
    // prefilters feed [base] which then feeds the overlay
    expect(graph).toContain("[0:v]scale=out_color_matrix=bt709,format=yuv420p[base]");
    expect(graph).toContain("[base][lg]overlay=");
    // burn-ins are applied to the overlay output [ov] and produce the final [v]
    // (timecode's own value contains a ';', so match the segment start instead)
    expect(graph).toContain("[ov]drawtext");
    expect(graph).toContain("timecode");
    expect(graph.endsWith("format=yuv420p[v]")).toBe(true);
    expect(graph.indexOf("overlay=")).toBeLessThan(graph.indexOf("[ov]drawtext"));
  });

  it("reads [0:v] directly when the pattern has no prefilters", () => {
    const graph = buildCommand(opts({ logo: logo() })).args[
      buildCommand(opts({ logo: logo() })).args.indexOf("-filter_complex") + 1
    ];
    expect(graph).toContain("[0:v][lg]overlay=");
    expect(graph).not.toContain("[base]");
  });

  describe("position (X/Y placement across the safe area)", () => {
    // margin = round(1920 * 0.03) = 58, so travel is inset by 2*58 = 116.
    const graphFor = (xPct: number, yPct: number) => {
      const args = buildCommand(opts({ logo: logo({ xPct, yPct }) })).args;
      return args[args.indexOf("-filter_complex") + 1];
    };
    it("0/0 sits one margin from the top-left edge", () => {
      expect(graphFor(0, 0)).toContain(
        "overlay=x=58+(main_w-overlay_w-116)*0/100:y=58+(main_h-overlay_h-116)*0/100:"
      );
    });
    it("100/100 sits one margin from the bottom-right edge", () => {
      expect(graphFor(100, 100)).toContain(
        "overlay=x=58+(main_w-overlay_w-116)*100/100:y=58+(main_h-overlay_h-116)*100/100:"
      );
    });
    it("50/50 centers on both axes", () => {
      expect(graphFor(50, 50)).toContain(
        "overlay=x=58+(main_w-overlay_w-116)*50/100:y=58+(main_h-overlay_h-116)*50/100:"
      );
    });
    it("supports arbitrary integer percentages", () => {
      expect(graphFor(72, 40)).toContain(
        "overlay=x=58+(main_w-overlay_w-116)*72/100:y=58+(main_h-overlay_h-116)*40/100:"
      );
    });
    it("rounds and clamps out-of-range percentages to 0–100", () => {
      const g = graphFor(150, -10);
      expect(g).toContain("*100/100"); // x clamped up
      expect(g).toContain("*0/100"); // y clamped down
    });
    it("matches every quick-set preset's x/y mapping", () => {
      for (const p of LOGO_POSITIONS) {
        expect(graphFor(p.x, p.y)).toContain(`*${p.x}/100:y=58+(main_h-overlay_h-116)*${p.y}/100:`);
      }
    });
  });

  describe("opacity", () => {
    const graphFor = (opacity: number) => {
      const args = buildCommand(opts({ logo: logo({ opacity }) })).args;
      return args[args.indexOf("-filter_complex") + 1];
    };
    it("adds an alpha fade only when translucent", () => {
      expect(graphFor(0.5)).toContain("format=rgba,colorchannelmixer=aa=0.5[lg]");
      expect(graphFor(1)).not.toContain("colorchannelmixer");
    });
    it("clamps sub-minimum opacity up to the floor (0.2)", () => {
      expect(graphFor(0.01)).toContain("colorchannelmixer=aa=0.2");
    });
  });

  describe("size clamping", () => {
    const logoWFor = (sizePct: number) => {
      const args = buildCommand(opts({ logo: logo({ sizePct }) })).args;
      const graph = args[args.indexOf("-filter_complex") + 1];
      return Number(graph.match(/scale=(\d+):-1/)![1]);
    };
    it("clamps oversize down to 40% of width", () => {
      expect(logoWFor(999)).toBe(Math.round(1920 * 0.4)); // 768
    });
    it("clamps undersize up to 5% of width", () => {
      expect(logoWFor(-5)).toBe(Math.round(1920 * 0.05)); // 96
    });
  });

  it("sanitizes the logo extension into the FS filename", () => {
    const args = buildCommand(opts({ logo: logo({ ext: "JPG" }) })).args;
    expect(args.join(" ")).toContain("-i logo.jpg");
  });
});

describe("output metadata", () => {
  it("names the file by pattern, format, duration and container", () => {
    const { outputName, mimeType } = buildCommand(
      opts({ pattern: "testsrc", format: "720p5994", durationSec: 12, container: "mov" })
    );
    expect(outputName).toBe("testsrc_720p5994_12s.mov");
    expect(mimeType).toBe("video/quicktime");
  });

  it("adds +faststart only for mp4", () => {
    expect(buildCommand(opts({ container: "mp4" })).args.join(" ")).toContain("+faststart");
    expect(buildCommand(opts({ container: "ts" })).args.join(" ")).not.toContain("+faststart");
  });
});

describe("logoLayoutFractions (UI preview mirror of overlayPosition)", () => {
  const AR = 16 / 9; // frame aspect for all current formats
  const square = 1; // logo height/width

  it("width fraction tracks sizePct; a square logo's height accounts for aspect", () => {
    const l = logoLayoutFractions(50, 50, 15, square, AR);
    expect(l.width).toBeCloseTo(0.15, 5);
    expect(l.height).toBeCloseTo(0.15 * AR, 5); // square logo is taller in height-fraction
  });

  it("0/0 sits one margin (3% of width) from the top-left", () => {
    const l = logoLayoutFractions(0, 0, 15, square, AR);
    expect(l.left).toBeCloseTo(0.03, 5);
    expect(l.top).toBeCloseTo(0.03 * AR, 5); // width-based margin is taller vertically
  });

  it("50/50 centers the logo box on both axes", () => {
    const l = logoLayoutFractions(50, 50, 15, square, AR);
    expect(l.left + l.width / 2).toBeCloseTo(0.5, 5);
    expect(l.top + l.height / 2).toBeCloseTo(0.5, 5);
  });

  it("100/100 sits one margin from the bottom-right", () => {
    const l = logoLayoutFractions(100, 100, 15, square, AR);
    expect(l.left + l.width).toBeCloseTo(1 - 0.03, 5);
    expect(l.top + l.height).toBeCloseTo(1 - 0.03 * AR, 5);
  });

  it("clamps out-of-range percentages", () => {
    const lo = logoLayoutFractions(-50, -50, 15, square, AR);
    const hi = logoLayoutFractions(200, 200, 15, square, AR);
    expect(lo.left).toBeCloseTo(0.03, 5);
    expect(hi.left + hi.width).toBeCloseTo(1 - 0.03, 5);
  });
});

describe("clampDuration", () => {
  it("rounds and bounds to the allowed range", () => {
    expect(clampDuration(30.4)).toBe(30);
    expect(clampDuration(0)).toBe(MIN_DURATION_SEC);
    expect(clampDuration(99999)).toBe(MAX_DURATION_SEC);
    expect(clampDuration(NaN)).toBe(MIN_DURATION_SEC);
  });
});

describe("escapeFilterValue", () => {
  it("wraps in single quotes", () => {
    expect(escapeFilterValue("GAME 4")).toBe("'GAME 4'");
  });
  it("escapes colons for the option parser", () => {
    expect(escapeFilterValue("a:b")).toBe("'a\\:b'");
  });
  it("escapes backslashes", () => {
    expect(escapeFilterValue("a\\b")).toBe("'a\\\\b'");
  });
});
