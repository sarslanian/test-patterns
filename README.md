# Test Pattern Generator

Browser-based broadcast test-signal generator for [videotooling.com](https://videotooling.com). Renders a suite of known-good signals — color bars (HD SMPTE, SMPTE EG 1, PAL 75/100%), calibration and diagnostic patterns (PLUGE black-level, a moving pattern, per-frame flicker, a field-order sweep), and an A/V lip-sync pattern — alongside a 1 kHz reference tone, running drop-frame timecode, and optional label / safe-area burn-ins. Everything is generated **client-side with ffmpeg.wasm** (no server, no uploads) and exported as H.264/AAC in MP4, MOV, or MPEG-TS. Useful for validating ingest paths, encoder configs, and sync/color checks without spinning up OBS or a hardware pattern generator.

## Features

- **Patterns:** HD SMPTE bars (RP 219), classic SMPTE bars (EG 1), PAL/EBU 75% and 100% bars, `testsrc` moving pattern (catches frozen frames), lip-sync (white flash + 100 ms beep every second, frame-aligned), PLUGE (−2/0/+2/+4% near-black steps + 75% white reference, exact code values 11/16/21/26), field sweep (8 px/frame bar — wrong field order shows as judder), black/white per-frame flicker (dropped/repeated frames show instantly; becomes field-rate alternation in 1080i)
- **Formats:** 1080p59.94, 1080i59.94 (TFF, interlaced coding flags), 720p59.94
- **Burn-ins:** running drop-frame timecode, optional custom label text, safe-area markers (93% action / 90% title + center cross, SMPTE ST 2046-1)
- **Audio:** 1 kHz stereo tone at exactly −20 / −18 / −12 dBFS peak, or silence; the lip-sync pattern gates the tone into a 100 ms beep locked to its flash
- **Output:** H.264 + AAC in MP4 (faststart), MOV, or MPEG-TS, 1–300 s, with an inline looping preview and one-click blob download. MP4/MOV play natively; MPEG-TS (H.264/AAC elementary streams, for SRT/UDP ingest testing) can't go into a `<video>` element directly, so its preview is transmuxed to fMP4 in-browser with **hls.js** via MSE — the downloaded file is still the raw transport stream.

## Color correctness notes

The lavfi sources are not uniform, so each pattern gets its own normalization to Rec.709 before encode:

- `smptehdbars` bakes **Rec.709** YCbCr values → passed through untouched
- `smptebars`, `pal75bars`, `pal100bars` bake **Rec.601** values → `colormatrix=bt601:bt709`
- `testsrc` is rgb24 → `scale=out_color_matrix=bt709` (swscale would otherwise default to bt601)
- flicker is built from `color` + `drawbox` at exact broadcast levels (Y=16/235, verified per-frame)

All outputs are tagged `bt709` primaries/transfer/matrix. The tone uses `aevalsrc` with amplitude 0.1 rather than the `sine` source, because `sine` is not full-scale (it peaks at −18 dBFS).

## SharedArrayBuffer / threading

ffmpeg.wasm's multi-threaded core requires `SharedArrayBuffer`, which requires cross-origin isolation. `next.config.ts` sets these headers on every route:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The app checks `window.crossOriginIsolated` at runtime and loads the multi-threaded core when true, falling back to the single-threaded core otherwise — the header badge in the UI shows which one is active, so a misconfigured deployment is visible instead of silently slow.

Core wasm builds and the burn-in font are copied from `node_modules` into `public/` by `scripts/copy-ffmpeg-assets.mjs` (runs automatically via `predev`/`prebuild`) so everything is served same-origin, which COEP `require-corp` demands.

## ffmpeg.wasm quirks this codebase works around

- **Two `-f lavfi` inputs deadlock the multi-threaded core** — `exec()` never returns, hanging right after the x264 banner. Both sources are fused into a single lavfi input with `[out0]`/`[out1]` pads instead (`lib/build-command.ts`).
- **Turbopack can't bundle `@ffmpeg/ffmpeg`'s class worker** (it dynamic-imports the core from a runtime URL: "Cannot find module as expression is too dynamic"). The ESM dist is vendored into `public/vendor/ffmpeg/` and passed via `classWorkerURL` — as a fully-qualified URL, because Turbopack rewrites `import.meta.url` to a `file:///` path.
- **The ESM core builds must be used, not UMD** — the class worker is a module worker, so `importScripts` throws and it falls back to `import()`, which needs the core's default export.
- **The vendored `.d.ts` files must not reach `public/`** — `worker.d.ts` carries `/// <reference no-default-lib="true" />` + `lib="webworker"`, which poisons the app's global TypeScript environment via the tsconfig `**/*.ts` include (`public` is also excluded in `tsconfig.json`).
- **The core is ffmpeg 5.1-era; not every lavfi source in current docs exists or works.** `zoneplate` isn't compiled in at all (added in 6.0), and `colorchart` hangs then faults with "memory access out of bounds" (verified in-browser at any patch size, though it works on native ffmpeg 8). The `strings ffmpeg-core.wasm | grep <name>` check is *unreliable* (string pooling — `scale` shows zero matches yet works), so an in-browser smoke test is the only real answer. A wasm fault also bricks the loaded core — `lib/ffmpeg-client.ts` auto-terminates on `RuntimeError` so the next generate reloads fresh.
- **`loop=-1:size=1` misbehaves in the 5.1 wasm core** — it neither stops upstream evaluation nor terminates, and exits −1 mid-encode. For static expensive frames (PLUGE's `geq`), generate the source at `rate=1` and duplicate with `fps=<rate>` instead.
- **Moving elements must use `overlay … eval=frame`, not drawbox expressions** — drawbox geometry is safe only as constants plus timeline `enable`; overlay's per-frame `x`/`y` with `n`/`t` is verified working in the core.

## Development

```bash
npm install
npm run dev
```

## Deploy

Vercel, own subdomain (`patterns.videotooling.com`), following the per-tool repo pattern.
