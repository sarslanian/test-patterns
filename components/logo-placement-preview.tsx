"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { LOGO_MARGIN_PCT } from "@/lib/presets";
import { clamp, logoLayoutFractions } from "@/lib/build-command";

/**
 * Live, aspect-correct preview of where the logo lands and how big it is.
 * Geometry comes from logoLayoutFractions (the same math as the ffmpeg
 * overlay), and the logo is draggable to set position by eye.
 */
export function LogoPlacementPreview({
  url,
  logoAspect,
  frameAspect,
  xPct,
  yPct,
  sizePct,
  disabled,
  onChange,
}: {
  url: string;
  logoAspect: number;
  frameAspect: number;
  xPct: number;
  yPct: number;
  sizePct: number;
  disabled?: boolean;
  onChange: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<{ offX: number; offY: number } | null>(null);

  const layout = logoLayoutFractions(xPct, yPct, sizePct, logoAspect, frameAspect);
  const marginX = LOGO_MARGIN_PCT / 100;
  const marginY = marginX * frameAspect;
  const travelX = Math.max(1e-6, 1 - layout.width - 2 * marginX);
  const travelY = Math.max(1e-6, 1 - layout.height - 2 * marginY);

  const applyFromPointer = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    const grab = grabRef.current;
    if (!box || !grab) return;
    const r = box.getBoundingClientRect();
    const leftFrac = (clientX - r.left) / r.width - grab.offX;
    const topFrac = (clientY - r.top) / r.height - grab.offY;
    const x = ((leftFrac - marginX) / travelX) * 100;
    const y = ((topFrac - marginY) / travelY) * 100;
    onChange(Math.round(clamp(x, 0, 100, 100)), Math.round(clamp(y, 0, 100, 100)));
  };

  return (
    <div
      ref={boxRef}
      className="relative w-full select-none overflow-hidden rounded-md border border-border bg-black"
      style={{ aspectRatio: String(frameAspect) }}
    >
      {/* 3% safe-margin guide — the bounds of the logo's travel */}
      <div
        className="pointer-events-none absolute rounded-sm border border-dashed border-white/15"
        style={{
          left: `${marginX * 100}%`,
          right: `${marginX * 100}%`,
          top: `${marginY * 100}%`,
          bottom: `${marginY * 100}%`,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        onPointerDown={(e) => {
          if (disabled) return;
          const box = boxRef.current;
          if (!box) return;
          const r = box.getBoundingClientRect();
          grabRef.current = {
            offX: (e.clientX - r.left) / r.width - layout.left,
            offY: (e.clientY - r.top) / r.height - layout.top,
          };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerMove={(e) => {
          if (grabRef.current) applyFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          grabRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerCancel={() => {
          grabRef.current = null;
        }}
        className={cn(
          "absolute touch-none object-contain",
          disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        )}
        style={{
          left: `${layout.left * 100}%`,
          top: `${layout.top * 100}%`,
          width: `${layout.width * 100}%`,
          height: "auto",
        }}
      />
    </div>
  );
}
