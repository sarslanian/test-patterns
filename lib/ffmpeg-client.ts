import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

import { buildCommand, FONT_FS_PATH, type GenerateOptions } from "./build-command";
import { logoFsPath } from "./presets";

export type ThreadMode = "multi" | "single";

export interface GenerateCallbacks {
  onProgress?: (ratio: number) => void;
  onLog?: (line: string) => void;
}

export interface GenerateResult {
  data: Uint8Array;
  outputName: string;
  mimeType: string;
}

/**
 * Wraps one FFmpeg instance (which itself runs in a Web Worker). Multi-thread
 * core when the page is crossOriginIsolated (COOP/COEP applied), otherwise the
 * single-thread core.
 */
export class FfmpegEngine {
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<ThreadMode> | null = null;
  private loadedMode: ThreadMode | null = null;
  readonly logTail: string[] = [];

  /** Best available mode: multi when the page is cross-origin isolated. */
  get threadMode(): ThreadMode {
    return typeof window !== "undefined" && window.crossOriginIsolated ? "multi" : "single";
  }

  /** The core mode actually loaded right now (null before the first load resolves). */
  get activeMode(): ThreadMode | null {
    return this.loadedMode;
  }

  /**
   * Load (or reuse) a core in the requested mode, defaulting to the best
   * available. If a different mode is already loaded it is swapped out — the
   * multi-threaded core deadlocks on any filtergraph that combines two inputs
   * (two lavfi sources, or a file + overlay), so logo renders force "single".
   */
  load(mode: ThreadMode = this.threadMode): Promise<ThreadMode> {
    if (this.loadedMode && this.loadedMode !== mode) {
      this.terminate();
    }
    if (!this.loading) {
      this.loading = this.doLoad(mode).catch((err) => {
        this.loading = null;
        this.ffmpeg = null;
        this.loadedMode = null;
        throw err;
      });
    }
    return this.loading;
  }

  private async doLoad(mode: ThreadMode): Promise<ThreadMode> {
    const base = mode === "multi" ? "/ffmpeg/core-mt" : "/ffmpeg/core-st";
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      this.logTail.push(message);
      if (this.logTail.length > 60) this.logTail.shift();
    });
    await ffmpeg.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
      ...(mode === "multi" ? { workerURL: `${base}/ffmpeg-core.worker.js` } : {}),
      // Unbundled copy of @ffmpeg/ffmpeg's worker (see copy-ffmpeg-assets.mjs):
      // the bundled one can't dynamic-import the core under Turbopack. Must be
      // a fully-qualified URL — the class resolves it against import.meta.url,
      // which Turbopack rewrites to a file:/// path.
      classWorkerURL: `${window.location.origin}/vendor/ffmpeg/worker.js`,
    });
    await ffmpeg.writeFile(FONT_FS_PATH, await fetchFile("/fonts/DejaVuSansMono-Bold.ttf"));
    this.ffmpeg = ffmpeg;
    this.loadedMode = mode;
    return mode;
  }

  async generate(opts: GenerateOptions, cbs: GenerateCallbacks = {}): Promise<GenerateResult> {
    // Overlaying a logo needs a second input, which deadlocks the MT core —
    // fall back to the single-threaded core for those renders.
    await this.load(opts.logo ? "single" : this.threadMode);
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg) throw new Error("Engine not loaded");

    const { args, outputName, mimeType } = buildCommand(opts);
    const durationUs = opts.durationSec * 1_000_000;

    // The uploaded logo (if any) is a per-render input, so write it fresh each
    // time and remove it in the finally block. Stays in the browser FS only.
    const logoPath = opts.logo ? logoFsPath(opts.logo.ext) : null;
    if (opts.logo && logoPath) {
      // writeFile transfers the buffer to the worker, detaching it — copy so
      // the caller's stored Uint8Array survives for a re-render with the same
      // logo (otherwise the second render throws "ArrayBuffer is detached").
      await ffmpeg.writeFile(logoPath, opts.logo.data.slice());
    }

    // lavfi inputs are infinite, so ffmpeg can't report a meaningful ratio —
    // derive progress from encoded output time vs requested duration instead.
    const onProgress = ({ time }: { progress: number; time: number }) => {
      if (cbs.onProgress && durationUs > 0) {
        cbs.onProgress(Math.max(0, Math.min(1, time / durationUs)));
      }
    };
    const onLog = ({ message }: { message: string }) => cbs.onLog?.(message);
    ffmpeg.on("progress", onProgress);
    if (cbs.onLog) ffmpeg.on("log", onLog);

    try {
      const code = await ffmpeg.exec(args);
      if (code !== 0) {
        throw new Error(
          `ffmpeg exited with code ${code}\n${this.logTail.slice(-12).join("\n")}`
        );
      }
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      await ffmpeg.deleteFile(outputName).catch(() => {});
      cbs.onProgress?.(1);
      return { data, outputName, mimeType };
    } catch (err) {
      // A wasm fault (e.g. "memory access out of bounds") leaves the core in
      // an unusable state — drop it so the next generate loads a fresh one.
      if (err instanceof WebAssembly.RuntimeError || /RuntimeError|out of bounds/.test(String(err))) {
        this.terminate();
      }
      throw err;
    } finally {
      ffmpeg.off("progress", onProgress);
      if (cbs.onLog) ffmpeg.off("log", onLog);
      // Only touch the FS if the worker is still alive — a wasm fault above
      // terminates it, and deleteFile would then throw on a null instance.
      if (logoPath && this.ffmpeg) {
        await this.ffmpeg.deleteFile(logoPath).catch(() => {});
      }
    }
  }

  /** Hard-stop a running job. The worker is killed, so the engine reloads lazily. */
  terminate(): void {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loading = null;
    this.loadedMode = null;
  }
}
