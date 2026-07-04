"use client";

import { useEffect, useRef, useState } from "react";
import { FileVideo } from "lucide-react";

interface TsPreviewProps {
  /** Blob URL of the .ts file */
  src: string;
  durationSec: number;
  summary: string;
}

type Status = "loading" | "playing" | "unsupported" | "error";

/**
 * Previews an MPEG-TS blob in-browser. A raw .ts can't go into a <video>
 * element, so hls.js transmuxes it to fMP4 via MSE. hls.js needs a playlist,
 * so we synthesize a one-segment VOD playlist pointing at the in-memory blob.
 * Safari plays HLS natively; anywhere hls.js/MSE is unavailable we fall back
 * to a download prompt.
 */
export function TsPreview({ src, durationSec, summary }: TsPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let hls: import("hls.js").default | null = null;
    let playlistUrl: string | null = null;
    let cancelled = false;

    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${Math.ceil(durationSec)}`,
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      `#EXTINF:${durationSec.toFixed(3)},`,
      src,
      "#EXT-X-ENDLIST",
      "",
    ].join("\n");
    playlistUrl = URL.createObjectURL(
      new Blob([playlist], { type: "application/vnd.apple.mpegurl" })
    );

    void (async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;

      const { default: Hls } = await import("hls.js");
      if (cancelled) return;

      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!cancelled) setStatus("playing");
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal && !cancelled) {
            setStatus("error");
            setDetail(`${data.type} · ${data.details}`);
          }
        });
        hls.loadSource(playlistUrl!);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = playlistUrl!;
        setStatus("playing");
      } else {
        setStatus("unsupported");
      }
    })();

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
      if (playlistUrl) URL.revokeObjectURL(playlistUrl);
    };
  }, [src, durationSec]);

  const failed = status === "error" || status === "unsupported";

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-md border border-border bg-black">
        <video
          ref={videoRef}
          controls
          loop
          autoPlay
          muted
          playsInline
          className="w-full"
        />
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-4 py-8 text-center">
            <FileVideo className="h-8 w-8 text-muted-foreground/70" />
            <p className="max-w-sm text-sm text-muted-foreground">
              {status === "unsupported"
                ? "This browser can't transmux MPEG-TS for preview."
                : "Couldn't build the MPEG-TS preview."}{" "}
              The file is fine — download it and check in VLC, ffprobe, or your SRT/ingest
              workflow.
            </p>
            {detail ? (
              <p className="font-mono text-[11px] text-muted-foreground/70">{detail}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{summary}</p>
      <p className="text-xs text-muted-foreground/70">
        MPEG-TS is transmuxed to fMP4 in-browser for preview (hls.js) — the downloaded file is
        the raw transport stream. Unmute to hear the reference tone.
      </p>
    </>
  );
}
