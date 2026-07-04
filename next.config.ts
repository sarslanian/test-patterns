import type { NextConfig } from "next";

/**
 * COOP/COEP are required on every route so the page is crossOriginIsolated,
 * which unlocks SharedArrayBuffer for ffmpeg.wasm's multi-threaded core.
 * Without them the app still works but falls back to the single-threaded core.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
