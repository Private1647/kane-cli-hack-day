"use client";

import { useEffect, useRef, useState } from "react";
import { computeDots, inkLayers, loadImage, type Tone } from "@/components/hero/halftone";

// The passport portrait: the person's own (private) selfie through the same
// square-dot halftone as the hero statues, light dots on ink. Falls back to
// the Doto monogram while loading or if the image can't be read.

// A flatter curve than the hero hands: faces need mid-tones.
const FACE: Tone = { blackPoint: 0.08, whitePoint: 0.92, brightness: 0.02, contrast: 0.15, gamma: 1.15 };
const WIDTH = 520; // design-space width → 65 dot columns

export default function HalftonePortrait({ src, initials, className = "" }: { src: string; initials: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    loadImage(src)
      .then((img) => {
        if (cancelled || !canvas.current) return;
        const { W, H, dots } = computeDots(img, WIDTH, FACE);
        const c = canvas.current;
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        for (const layer of inkLayers(dots)) {
          ctx.fillStyle = `rgba(242,242,242,${layer.a})`;
          ctx.fill(layer.path);
        }
        setState("ok");
      })
      .catch(() => !cancelled && setState("failed"));
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <canvas ref={canvas} role="img" aria-label="Your passport portrait (halftone)" className={`h-full w-full object-cover ${state === "ok" ? "" : "hidden"}`} />
      {state !== "ok" && <Monogram initials={initials} />}
      <span className="sr-only">{state === "loading" ? "Loading portrait" : ""}</span>
    </div>
  );
}

export function Monogram({ initials }: { initials: string }) {
  return (
    <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-ink">
      <span className="font-dots text-6xl font-black text-bright sm:text-7xl">{initials}</span>
    </div>
  );
}
