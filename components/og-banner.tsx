import { siteUrl } from "@/lib/site";

const host = new URL(siteUrl).hostname.replace(/^www\./, "");

/** 75% SMPTE bar colors, left to right */
const BAR_COLORS = [
  "#bfbfbf",
  "#bfbf00",
  "#00bfbf",
  "#00bf00",
  "#bf00bf",
  "#bf0000",
  "#0000bf",
];

/** Shared 1200×630 layout for Open Graph and Twitter cards (`next/og` subset) */
export function OgBanner() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 72,
        background: "linear-gradient(155deg, #09090b 0%, #18181b 45%, #0c1220 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", height: 56, borderRadius: 6, overflow: "hidden" }}>
          {BAR_COLORS.map((c) => (
            <div key={c} style={{ width: 10, height: 56, background: c }} />
          ))}
        </div>
        <span
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#fafafa",
            lineHeight: 1.05,
          }}
        >
          Test Pattern Generator
        </span>
      </div>
      <div
        style={{
          fontSize: 30,
          color: "#a1a1aa",
          maxWidth: 940,
          lineHeight: 1.35,
        }}
      >
        SMPTE bars, moving pattern, 1 kHz −20 dBFS tone, timecode burn-in — rendered in your
        browser, no uploads.
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 24,
          color: "#71717a",
        }}
      >
        {host}
      </div>
    </div>
  );
}
