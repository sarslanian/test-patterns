import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

import { siteUrl } from "@/lib/site";

const title = "Test Pattern Generator — SMPTE bars & tone | videotooling.com";
/** ~150 chars — fits common SERP / social limits */
const description =
  "Generate broadcast test signals in your browser: SMPTE bars, moving pattern, 1 kHz -20 dBFS tone, timecode burn-in. ffmpeg.wasm — no uploads, no backend.";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const metadataBase =
    host != null && host.length > 0
      ? new URL(`${proto}://${host}`)
      : new URL(siteUrl);

  return {
    metadataBase,
    title,
    description,
    keywords: [
      "test pattern",
      "SMPTE bars",
      "color bars",
      "test signal generator",
      "1 kHz tone",
      "-20 dBFS",
      "timecode burn-in",
      "broadcast",
      "streaming",
      "encoder test",
      "ingest test",
      "SRT",
      "ffmpeg",
      "videotooling",
    ],
    applicationName: "Test Pattern Generator",
    authors: [{ name: "videotooling.com", url: "https://videotooling.com" }],
    creator: "videotooling.com",
    publisher: "videotooling.com",
    category: "technology",
    robots: { index: true, follow: true },
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: metadataBase.href,
      siteName: "videotooling.com",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Test Pattern Generator",
  url: siteUrl,
  description,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript and WebAssembly",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  isPartOf: {
    "@type": "WebSite",
    name: "videotooling.com",
    url: "https://videotooling.com",
  },
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
