import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Characters invalid in filenames on Windows/macOS/Linux, plus control chars. */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** Strip filesystem-invalid characters from a user-supplied filename. */
export function sanitizeFileName(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS, "");
}

/** Split "name.ext" into base and extension (extension excludes the dot). */
export function splitExtension(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, i), ext: fileName.slice(i + 1) };
}
