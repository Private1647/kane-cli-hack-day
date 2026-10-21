"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { computeDots, handCrops, inkLayers, loadImage, tintToLime, type Crop, type InkLayer } from "./halftone";
import { LENS, LENS_MEDIA, buildHitMask, hits, type HitMask } from "./lens";
import { useLensSources } from "./HeroLens";

const INK = "#f2f2f2";

// Aspect ratio of each hand's box before the halftone has been computed.
const INITIAL_ASPECT: Record<Side, string> = { left: "764.48 / 331.38", right: "708.48 / 364.392" };
// How the fresco photo lines up with the halftone, per half.
const PHOTO: Record<Side, { a: number; bx: number; by: number }> = {
  left: { a: 2.1394, bx: -450, by: -210 },
  right: { a: 2.2263, bx: -200, by: -290 },
};
const PHOTO_SPLIT = 1004.5;
const SPLIT_FADE = 220; // design px over which each half fades out at the split

type Side = "left" | "right";

type Loaded = {
  layers: InkLayer[];
  crops: Record<Side, Crop>;
  fresco: HTMLImageElement;
};

let shared: Promise<Loaded> | null = null;
function loadHands() {
  return (shared ??= Promise.all([
    loadImage("/halftone/hands/source.webp"),
    loadImage("/halftone/hands/fresco.webp"),
  ]).then(([source, fresco]) => {
    const design = computeDots(source);
    return { layers: inkLayers(design.dots), crops: handCrops(design), fresco };
  }));
}

function drawPhoto(ctx: CanvasRenderingContext2D, fresco: HTMLImageElement, side: Side) {
  const { a, bx, by } = PHOTO[side];
  const w = fresco.naturalWidth;
  const h = fresco.naturalHeight;
  const from = side === "left" ? 0 : PHOTO_SPLIT;
  const to = side === "left" ? PHOTO_SPLIT : w;
  ctx.drawImage(fresco, from, 0, to - from, h, bx + from * a, by, (to - from) * a, h * a);
}

export default function HalftoneHand({
  id,
  side,
  alt,
  className = "",
  children,
}: {
  id: string;
  side: Side;
  alt: string;
  className?: string;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [crop, setCrop] = useState<Crop | null>(null);
  const sources = useLensSources();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let disposed = false;
    let data: Loaded | null = null;
    let cw = 0;
    let ch = 0;
    const ink = document.createElement("canvas");
    const photo = document.createElement("canvas");
    let hitMask: HitMask | null = null;
    const lensMedia = window.matchMedia(LENS_MEDIA);

    const layout = () => {
      if (!data) return;
      const c = data.crops[side];
      const rect = canvas.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const el of [canvas, ink]) {
        el.width = Math.round(cw * dpr);
        el.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = (cw - 2 * LENS) / c.w;
      const toDesign = (t: CanvasRenderingContext2D) =>
        t.setTransform(s * dpr, 0, 0, s * dpr, (LENS - c.x * s) * dpr, (LENS - c.y * s) * dpr);

      const ictx = ink.getContext("2d");
      if (!ictx) return;
      toDesign(ictx);
      ictx.beginPath();
      ictx.rect(c.x, c.y, c.w, c.h);
      ictx.clip();
      ictx.fillStyle = INK;
      for (const { a, path } of data.layers) {
        ictx.globalAlpha = a;
        ictx.fill(path);
      }
      ictx.globalAlpha = 1;

      if (!lensMedia.matches) {
        hitMask = null;
        photo.width = photo.height = 0;
        paint();
        setReady(true);
        return;
      }

      photo.width = canvas.width;
      photo.height = canvas.height;
      hitMask = buildHitMask(ink, cw, ch, dpr);

      // Duotone the fresco in lime for the lens.
      const pctx = photo.getContext("2d", { willReadFrequently: true });
      if (!pctx) return;
      toDesign(pctx);
      drawPhoto(pctx, data.fresco, side);
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      tintToLime(pctx);
      // Each hand only gets its half of the fresco; fade the cut edge into
      // the lens's plain lime so the shared lens shows no hard seam there.
      {
        const { a, bx } = PHOTO[side];
        const edge = bx + PHOTO_SPLIT * a;
        const inner = side === "left" ? edge - SPLIT_FADE : edge + SPLIT_FADE;
        toDesign(pctx);
        const g = pctx.createLinearGradient(inner, 0, edge, 0);
        g.addColorStop(0, "#000");
        g.addColorStop(1, "rgba(0,0,0,0)");
        pctx.globalCompositeOperation = "destination-in";
        pctx.fillStyle = g;
        pctx.fillRect(-1e5, -1e5, 2e5, 2e5);
        pctx.globalCompositeOperation = "source-over";
        pctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      paint();
      setReady(true);
    };

    const paint = () => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(ink, 0, 0, cw, ch);
    };

    // Under the hero lens, show the lime-tinted fresco.
    const source = {
      layer: 0,
      hit: (x: number, y: number) => {
        const r = canvas.getBoundingClientRect();
        return hits(hitMask, x - r.left, y - r.top);
      },
      draw: (c: CanvasRenderingContext2D, ox: number, oy: number) => {
        if (!photo.width) return;
        const r = canvas.getBoundingClientRect();
        c.drawImage(photo, r.left - ox, r.top - oy, r.width, r.height);
      },
    };
    sources?.add(source);

    const start = () => {
      loadHands()
        .then((d) => {
          if (disposed) return;
          data = d;
          setCrop(d.crops[side]);
          layout();
        })
        .catch((err) => console.error(`[HalftoneHand ${id}]`, err));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "800px 0px" },
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
      sources?.delete(source);
    };
  }, [id, side, sources]);

  return (
    <div
      id={id}
      role="img"
      aria-label={alt}
      className={`relative ${className}`}
      style={{
        aspectRatio: crop ? `${crop.w} / ${crop.h}` : INITIAL_ASPECT[side],
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`pointer-events-none absolute block transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
        style={{
          top: -LENS,
          left: -LENS,
          width: `calc(100% + ${2 * LENS}px)`,
          height: `calc(100% + ${2 * LENS}px)`,
        }}
      />
      {children}
    </div>
  );
}
