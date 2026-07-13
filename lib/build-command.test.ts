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
    audioLayout: "stereo",
    burnTimecode: false,
    label: "",
    safeArea: false,
    slidingBox: false,
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

  it("sizes and rates the source from the resolution × rate combination", () => {
    const vfFor = (format: GenerateOptions["format"]) => {
      const args = buildCommand(opts({ format })).args;
      return args[args.indexOf("-i") + 1];
    };
    expect(vfFor("2160p25")).toContain("size=3840x2160:rate=25");
    expect(vfFor("1080p50")).toContain("size=1920x1080:rate=50");
    expect(vfFor("720p5994")).toContain("size=1280x720:rate=60000/1001");
    expect(vfFor("360p30")).toContain("size=640x360:rate=30");
  });

  it("sources 1080i50 at the 50 Hz field rate and interlaces", () => {
    const args = buildCommand(opts({ format: "1080i50" })).args;
    expect(args[args.indexOf("-i") + 1]).toContain("size=1920x1080:rate=50");
    expect(args[args.indexOf("-vf") + 1]).toContain("interlace=scan=tff");
  });

  describe("timecode counting mode", () => {
    const vfFor = (format: GenerateOptions["format"]) => {
      const args = buildCommand(opts({ format, burnTimecode: true })).args;
      return args[args.indexOf("-vf") + 1];
    };
    it("burns drop-frame timecode (';' separator) for the 29.97/59.94 family", () => {
      expect(vfFor("1080p5994")).toContain("timecode='00\\:00\\:00;00':timecode_rate=60000/1001");
      expect(vfFor("1080p2997")).toContain("timecode='00\\:00\\:00;00':timecode_rate=30000/1001");
    });
    it("burns non-drop timecode (':' separator) for integer rates", () => {
      expect(vfFor("1080p50")).toContain("timecode='00\\:00\\:00\\:00':timecode_rate=50");
      expect(vfFor("720p25")).toContain("timecode='00\\:00\\:00\\:00':timecode_rate=25");
    });
    it("burns non-drop timecode for 23.98 (no drop-frame standard)", () => {
      expect(vfFor("1080p2398")).toContain("timecode='00\\:00\\:00\\:00':timecode_rate=24000/1001");
    });
    it("counts interlaced timecode at the frame rate, not the field rate", () => {
      expect(vfFor("1080i50")).toContain("timecode='00\\:00\\:00\\:00':timecode_rate=25");
      expect(vfFor("1080i5994")).toContain("timecode='00\\:00\\:00;00':timecode_rate=30000/1001");
    });
  });

  describe("freeze-detection sliding box", () => {
    // The box is composited in the source graph (the single lavfi input), not
    // as a -vf burn-in: drawbox position can't move in this core, so motion has
    // to be an n-driven overlay with eval=frame (same as field-sweep).
    const inputFor = (over: Partial<GenerateOptions> = {}) => {
      const args = buildCommand(opts({ slidingBox: true, ...over })).args;
      return args[args.indexOf("-i") + 1];
    };
    it("overlays an n-driven (frame-locked) marching box only when enabled", () => {
      expect(inputFor()).toContain("overlay=x='mod(n*8,main_w)':y=929:eval=frame"); // 1920/240 = 8
      expect(buildCommand(opts()).args[buildCommand(opts()).args.indexOf("-i") + 1]).not.toContain(
        "mod(n*"
      );
    });
    it("stays inside one lavfi input with the [out0]/[out1] pads (MT-safe)", () => {
      const args = buildCommand(opts({ slidingBox: true })).args;
      expect(countArg(args, "-i")).toBe(1);
      expect(args).not.toContain("-filter_complex"); // still the fast -vf path
      const input = args[args.indexOf("-i") + 1];
      expect(input).toContain("[out0]");
      expect(input).toContain("[out1]");
    });
    it("builds a black box with a white inner fill for visibility on any bar", () => {
      const input = inputFor();
      expect(input).toContain("color=c=black:size=54x54"); // round(1080*0.05)=54
      // inner white fill, inset by the 5px border: 54 - 2*5 = 44
      expect(input).toContain("drawbox=x=5:y=5:w=44:h=44:color=white:thickness=fill");
    });
    it("scales the step to frame width so motion reads the same at every size", () => {
      expect(inputFor({ format: "720p50" })).toContain("mod(n*5,main_w)"); // 1280/240 ≈ 5
      expect(inputFor({ format: "2160p25" })).toContain("mod(n*16,main_w)"); // 3840/240 = 16
    });
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

describe("audio layout (channel line-up)", () => {
  const audioInput = (over: Partial<GenerateOptions> = {}) => {
    const args = buildCommand(opts(over)).args;
    return args[args.indexOf("-i") + 1];
  };
  const bitrateOf = (over: Partial<GenerateOptions> = {}) => {
    const args = buildCommand(opts(over)).args;
    return args[args.indexOf("-b:a") + 1];
  };

  it("defaults to a single-quoted stereo 1 kHz tone at 192k", () => {
    expect(audioInput()).toContain(
      "aevalsrc='0.1*sin(2*PI*1000*t)|0.1*sin(2*PI*1000*t)':s=48000"
    );
    expect(bitrateOf()).toBe("192k");
  });

  it("intermittent-left gates the left channel (quoted so the comma survives)", () => {
    expect(audioInput({ audioLayout: "stereo-intl" })).toContain(
      "aevalsrc='0.1*sin(2*PI*1000*t)*lt(mod(t,3),1.5)|0.1*sin(2*PI*1000*t)':s=48000"
    );
  });

  it("EBU 5.1 emits six channels (silent LFE) at 384k, still one input", () => {
    const args = buildCommand(opts({ audioLayout: "ebu51" })).args;
    const inp = args[args.indexOf("-i") + 1];
    expect(inp).toContain(":c=5.1:s=48000");
    const exprs = inp.match(/aevalsrc='([^']*)'/)![1].split("|");
    expect(exprs).toHaveLength(6);
    expect(exprs[3]).toBe("0"); // LFE silent
    expect(args[args.indexOf("-b:a") + 1]).toBe("384k");
    // multichannel must stay on the MT-safe single-input fast path
    expect(countArg(args, "-i")).toBe(1);
    expect(args).not.toContain("-filter_complex");
  });

  it("BLITS 5.1 sequences a 6 s identification loop with a 50 Hz LFE burst", () => {
    const inp = audioInput({ audioLayout: "blits51" });
    expect(inp).toContain(":c=5.1:s=48000");
    expect(inp).toContain("mod(t,6)"); // 6 s loop
    expect(inp).toContain("sin(2*PI*50*t)"); // LFE low tone
    expect(inp.match(/aevalsrc='([^']*)'/)![1].split("|")).toHaveLength(6);
  });

  it("makes multichannel silence with the layout's channel_layout", () => {
    expect(audioInput({ audio: "silence", audioLayout: "ebu51" })).toContain(
      "anullsrc=r=48000:cl=5.1"
    );
    expect(audioInput({ audio: "silence", audioLayout: "stereo" })).toContain(
      "anullsrc=r=48000:cl=stereo"
    );
  });

  it("lip-sync ignores the layout: stereo beep at 192k regardless", () => {
    const args = buildCommand(opts({ pattern: "lipsync", audioLayout: "blits51" })).args;
    const inp = args[args.indexOf("-i") + 1];
    expect(inp).toContain("lt(mod(t,1),0.1)"); // the beep, not BLITS
    expect(inp).not.toContain("c=5.1");
    expect(args[args.indexOf("-b:a") + 1]).toBe("192k");
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

  it("names the file by format id (dot-free even for fractional rates)", () => {
    expect(buildCommand(opts({ format: "1080p2398" })).outputName).toBe(
      "smptehdbars_1080p2398_30s.mp4"
    );
    expect(buildCommand(opts({ format: "2160p50" })).outputName).toBe(
      "smptehdbars_2160p50_30s.mp4"
    );
  });

  it("clamps duration tighter for large frames (wasm memory budget)", () => {
    const { args, outputName } = buildCommand(opts({ format: "2160p25", durationSec: 300 }));
    expect(outputName).toBe("smptehdbars_2160p25_75s.mp4");
    expect(args[args.indexOf("-t") + 1]).toBe("75");
    // 1080 keeps the full range
    expect(buildCommand(opts({ format: "1080p25", durationSec: 300 })).outputName).toBe(
      "smptehdbars_1080p25_300s.mp4"
    );
  });

  it("tags the filename with the audio line-up, except plain stereo", () => {
    expect(buildCommand(opts()).outputName).toBe("smptehdbars_1080p5994_30s.mp4"); // stereo: untagged
    expect(buildCommand(opts({ audioLayout: "ebu51" })).outputName).toBe(
      "smptehdbars_1080p5994_30s_ebu51.mp4"
    );
    expect(buildCommand(opts({ audioLayout: "blits51" })).outputName).toBe(
      "smptehdbars_1080p5994_30s_blits51.mp4"
    );
    expect(buildCommand(opts({ audioLayout: "stereo-intl" })).outputName).toBe(
      "smptehdbars_1080p5994_30s_stereo-intl.mp4"
    );
    // lip-sync forces stereo, so its files stay untagged even with a layout set
    expect(buildCommand(opts({ pattern: "lipsync", audioLayout: "blits51" })).outputName).toBe(
      "lipsync_1080p5994_30s.mp4"
    );
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
