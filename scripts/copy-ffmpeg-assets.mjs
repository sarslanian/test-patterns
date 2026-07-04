/**
 * Copies ffmpeg.wasm core builds and the burn-in font from node_modules into
 * public/ so they are served same-origin. Same-origin is required: the page is
 * COEP:require-corp, and the mt core's worker must be same-origin anyway.
 * Runs via predev/prebuild; output dirs are gitignored.
 */
import { copyFile, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");

// ESM builds: the class worker runs as a module worker, where importScripts is
// unavailable — it dynamic-imports the core and needs its default export.
const files = [
  ["@ffmpeg/core-mt/dist/esm/ffmpeg-core.js", "public/ffmpeg/core-mt/ffmpeg-core.js"],
  ["@ffmpeg/core-mt/dist/esm/ffmpeg-core.wasm", "public/ffmpeg/core-mt/ffmpeg-core.wasm"],
  ["@ffmpeg/core-mt/dist/esm/ffmpeg-core.worker.js", "public/ffmpeg/core-mt/ffmpeg-core.worker.js"],
  ["@ffmpeg/core/dist/esm/ffmpeg-core.js", "public/ffmpeg/core-st/ffmpeg-core.js"],
  ["@ffmpeg/core/dist/esm/ffmpeg-core.wasm", "public/ffmpeg/core-st/ffmpeg-core.wasm"],
  ["dejavu-fonts-ttf/ttf/DejaVuSansMono-Bold.ttf", "public/fonts/DejaVuSansMono-Bold.ttf"],
];

for (const [src, dest] of files) {
  const destPath = join(root, dest);
  await mkdir(dirname(destPath), { recursive: true });
  await copyFile(join(nm, src), destPath);
}

// The @ffmpeg/ffmpeg class worker dynamically import()s the core from a
// runtime URL, which bundlers (Turbopack) refuse to rewrite. Serving the ESM
// dist unbundled and passing classWorkerURL sidesteps the bundler entirely.
await cp(join(nm, "@ffmpeg/ffmpeg/dist/esm"), join(root, "public/vendor/ffmpeg"), {
  recursive: true,
  // .d.ts files carry no-default-lib/webworker lib references that would
  // poison the project's global TypeScript environment if ever included.
  filter: (src) => !src.endsWith(".d.ts") && !src.endsWith(".d.mts"),
});

console.log(`copy-ffmpeg-assets: copied ${files.length} files + vendored @ffmpeg/ffmpeg into public/`);
