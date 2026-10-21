"use client";

import { useEffect, useRef, useState } from "react";
import { DESIGN, computeDots, inkLayers, loadImage, tintToLime, type InkLayer } from "@/components/hero/halftone";
import { LENS, LENS_MEDIA, attachLens, buildHitMask, drawLens, hits, type HitMask } from "@/components/hero/lens";

// A classical sculpture printed as a halftone, with the same lime lens as the
// hero: hovering shows the original photograph, duotoned in lime.
//
// Assets live in /public/halftone/<name>/: `source.webp` (greyscale cut-out
// on black, drives the dots) and `photo.webp` (the full cut-out, for the lens).

const DOT_PX = 1.8; // on-screen size of one halftone cell, in CSS px
// The statue sources are already contrast-stretched, so map tone almost linearly.
const STATUE_TONE = { blackPoint: 0.15, whitePoint: 1, brightness: 0, contrast: 0, gamma: 1 };

export type StatueName = "hermes" | "hercules" | "discobolus" | "victory";

// Intrinsic aspect ratios of the cut-outs, so the box never shifts on load.
const ASPECT: Record<StatueName, number> = {
  hermes: 537 / 1400,
  hercules: 656 / 1400,
  discobolus: 757 / 1400,
  victory: 878 / 924,
};

type Images = { source: HTMLImageElement; photo: HTMLImageElement };
type Dots = { layers: InkLayer[]; W: number; H: number };

const images = new Map<StatueName, Promise<Images>>();
function load(name: StatueName) {
  let p = images.get(name);
  if (!p) {
    p = Promise.all([loadImage(`/halftone/${name}/source.webp`), loadImage(`/halftone/${name}/photo.webp`)]).then(
      ([source, photo]) => ({ source, photo }),
    );
    images.set(name, p);
  }
  return p;
}

// The dot grid is computed for the size the statue is shown at, so each dot
// stays ~DOT_PX on screen whether the statue is small or large.
const grids = new Map<string, Dots>();
function dotsFor(name: StatueName, source: HTMLImageElement, cssWidth: number): Dots {
  const W = Math.max(400, Math.round((cssWidth / DOT_PX) * DESIGN.cell));
  const key = `${name}:${W}`;
  let d = grids.get(key);
  if (!d) {
    const { H, dots } = computeDots(source, W, STATUE_TONE);
    d = { layers: inkLayers(dots), W, H };
    grids.set(key, d);
  }
  return d;
}

export default function Statue({
  name,
  alt,
  ink = "#f2f2f2",
  paper = "#000",
  className = "",
}: {
  name: StatueName;
  alt: string;
  /** Dot colour; pass a dark ink when placing the statue on a light fold. */
  ink?: string;
  /** Background behind the statue, so the hover lens blends into the fold. */
  paper?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let disposed = false;
    let data: Images | null = null;
    let cw = 0;
    let ch = 0;
    const dots = document.createElement("canvas");
    const photo = document.createElement("canvas");
    let hitMask: HitMask | null = null;
    const mono = getComputedStyle(canvas).getPropertyValue("--font-plex-mono").trim() || "monospace";
    const lensMedia = window.matchMedia(LENS_MEDIA);

    const layout = () => {
      if (!data) return;
      const rect = canvas.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const el of [canvas, dots, photo]) {
        el.width = Math.round(cw * dpr);
        el.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fit the design space into the box inside the LENS-wide bleed.
      const grid = dotsFor(name, data.source, cw - 2 * LENS);
      const s = (cw - 2 * LENS) / grid.W;
      const ictx = dots.getContext("2d")!;
      ictx.setTransform(s * dpr, 0, 0, s * dpr, LENS * dpr, LENS * dpr);
      ictx.fillStyle = ink;
      for (const { a, path } of grid.layers) {
        ictx.globalAlpha = a;
        ictx.fill(path);
      }
      ictx.globalAlpha = 1;

      if (lensMedia.matches) {
        hitMask = buildHitMask(dots, cw, ch, dpr);
        const pctx = photo.getContext("2d", { willReadFrequently: true })!;
        pctx.drawImage(data.photo, LENS * dpr, LENS * dpr, grid.W * s * dpr, grid.H * s * dpr);
        tintToLime(pctx);
      } else {
        hitMask = null;
      }
      lens.repaint();
      setReady(true);
    };

    const lens = attachLens(
      canvas,
      (x, y) => hits(hitMask, x, y),
      (x, y, open) => {
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(dots, 0, 0, cw, ch);
        drawLens(ctx, x, y, open, mono, () => ctx.drawImage(photo, 0, 0, cw, ch), paper);
      },
    );

    // Compute the halftone only when the statue gets close to the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        load(name)
          .then((d) => {
            if (disposed) return;
            data = d;
            layout();
          })
          .catch((err) => console.error(`[Statue ${name}]`, err));
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(canvas);
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    lensMedia.addEventListener("change", layout);

    return () => {
      disposed = true;
      io.disconnect();
      ro.disconnect();
      lensMedia.removeEventListener("change", layout);
      lens.dispose();
    };
  }, [name, ink, paper]);

  return (
    <div role="img" aria-label={alt} className={`relative ${className}`} style={{ aspectRatio: ASPECT[name] }}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`pointer-events-none absolute block transition-opacity duration-700 lg:pointer-events-auto ${ready ? "opacity-100" : "opacity-0"}`}
        style={{ top: -LENS, left: -LENS, width: `calc(100% + ${2 * LENS}px)`, height: `calc(100% + ${2 * LENS}px)` }}
      />
    </div>
  );
}
