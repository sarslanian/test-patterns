import { ImageResponse } from "next/og";

import { OgBanner } from "@/components/og-banner";

export const alt = "Test Pattern Generator — SMPTE bars, tone, and timecode in the browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<OgBanner />, { ...size });
}
