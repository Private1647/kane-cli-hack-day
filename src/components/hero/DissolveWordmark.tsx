"use client";

import { useEffect, useRef } from "react";
import { LENS, LENS_MEDIA, buildHitMask, hits, type HitMask } from "./lens";
import { useLensSources } from "./HeroLens";

// Wordmark that starts solid and breaks into square pixels, then loose
// pixels drifting off, towards the end of the last line. Under the hero lens
// the whole word shows solid, in dark ink on the lens's lime.

const CELL = 4; // CSS px per halftone cell
const TAIL = 0.227; // extra width on the right for the scattered pixels
const DISSOLVE_FROM = 0.6; // fraction of the last line where dots begin
const REVEAL_INK = "#1f2606"; // letters under the lens, on a lime ground

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function DissolveWordmark({
  lines,
  fontVar,
  color = "#f2f2f2",
}: {
  lines: string[];
  fontVar: string;
  color?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sources = useLensSources();

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const main = canvas?.getContext("2d");
    if (!box || !canvas || !main) return;
    const family = getComputedStyle(canvas).getPropertyValue(fontVar).trim() || "sans-serif";
    const lensMedia = window.matchMedia(LENS_MEDIA);

    // `base` is the dissolving wordmark, `reveal` the solid word shown under the
    // lens; both cover the canvas including its LENS-wide bleed.
    const base = document.createElement("canvas");
    const reveal = document.createElement("canvas");
    let hitMask: HitMask | null = null;
    let cw = 0;
    let ch = 0;

    const draw = () => {
      const width = box.getBoundingClientRect().width;
      if (!width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const textW = width / (1 + TAIL);

      // Size the font so the widest line fills the text area.
      const font = (px: number) => `700 ${px}px ${family}`;
      main.font = font(100);
      const widest = Math.max(...lines.map((l) => main.measureText(l).width));
      const size = (100 * textW) / widest;
      const lineH = size * 0.9;
      const height = Math.ceil(lineH * lines.length + size * 0.12);

      box.style.height = `${height}px`;
      cw = width + 2 * LENS;
      ch = height + 2 * LENS;
      for (const el of [canvas, base, reveal]) {
        el.width = Math.round(cw * dpr);
        el.height = Math.round(ch * dpr);
      }
      main.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ctx = base.getContext("2d")!;

      // Render the text once to an offscreen canvas to sample coverage from.
      const src = document.createElement("canvas");
      src.width = Math.round(width * dpr);
      src.height = Math.round(height * dpr);
      const sctx = src.getContext("2d", { willReadFrequently: true })!;
      sctx.scale(dpr, dpr);
      sctx.font = font(size);
      sctx.fillStyle = "#fff";
      sctx.textBaseline = "alphabetic";
      const metrics = lines.map((l) => sctx.measureText(l).width);
      lines.forEach((l, i) => sctx.fillText(l, 0, lineH * (i + 1) - size * 0.06));
      const alpha = sctx.getImageData(0, 0, src.width, src.height).data;

      ctx.setTransform(dpr, 0, 0, dpr, LENS * dpr, LENS * dpr);

      const last = lines.length - 1;
      const lastTop = lineH * last;
      const startX = metrics[last] * DISSOLVE_FROM;
      const endX = metrics[last];

      // Everything above the last line, plus its left part, stays solid.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, lastTop);
      ctx.rect(0, lastTop, startX, height - lastTop);
      ctx.clip();
      ctx.drawImage(src, 0, 0, width, height);
      ctx.restore();

      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      const rand = rng(7);
      const cov = (x: number, y: number) => {
        let sum = 0;
        const x0 = Math.floor(x * dpr);
        const y0 = Math.floor(y * dpr);
        const n = Math.max(1, Math.round(CELL * dpr));
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const px = x0 + i;
            const py = y0 + j;
            if (px < src.width && py < src.height) sum += alpha[(py * src.width + px) * 4 + 3];
          }
        return sum / (n * n * 255);
      };

      ctx.fillStyle = color;
      const gx0 = Math.floor(startX / CELL) * CELL;
      for (let y = lastTop; y < height; y += CELL) {
        for (let x = gx0; x < endX + CELL; x += CELL) {
          const c = cov(x, y);
          if (c < 0.05) continue;
          const p = Math.min(1, Math.max(0, (x - startX) / (endX - startX)));
          const cx = x + CELL / 2;
          const cy = y + CELL / 2;
          // Every glyph cell stays in place so the letters remain legible;
          // dots shrink and thin out towards the end of the word.
          if (rand() >= p * 0.18) {
            const s = CELL * 0.85 * Math.sqrt(c) * (1 - p * 0.25);
            ctx.globalAlpha = 1 - p * 0.15;
            ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
          }
          // The tail end also sheds loose pixels that drift off to the right.
          if (p > 0.5 && rand() < (p - 0.5) * 0.9) {
            const drift = CELL + (p - 0.3) * size * 0.8 * rand();
            const s = rand() < 0.3 ? CELL * 0.75 : CELL * 0.45;
            ctx.globalAlpha = 0.25 + 0.6 * rand();
            ctx.fillRect(cx + drift, cy + (rand() - 0.5) * size * 0.12, s, s);
          }
        }
      }
      // A few stray pixels past the end of the word.
      for (let k = 0; k < 70; k++) {
        const t = rand();
        ctx.globalAlpha = 0.25 + 0.5 * (1 - t);
        ctx.fillRect(
          endX + t * (width - endX) * 0.9,
          lastTop + size * (0.25 + rand() * 0.55),
          CELL * 0.45,
          CELL * 0.45,
        );
      }
      ctx.globalAlpha = 1;

      const rctx = reveal.getContext("2d", { willReadFrequently: true })!;
      rctx.setTransform(dpr, 0, 0, dpr, LENS * dpr, LENS * dpr);
      rctx.font = font(size);
      rctx.fillStyle = REVEAL_INK;
      lines.forEach((l, i) => rctx.fillText(l, 0, lineH * (i + 1) - size * 0.06));
      hitMask = lensMedia.matches ? buildHitMask(reveal, cw, ch, dpr) : null;

      main.clearRect(0, 0, cw, ch);
      main.drawImage(base, 0, 0, cw, ch);
    };

    const source = {
      layer: 1,
      hit: (x: number, y: number) => {
        const r = canvas.getBoundingClientRect();
        return hits(hitMask, x - r.left, y - r.top);
      },
      draw: (c: CanvasRenderingContext2D, ox: number, oy: number) => {
        const r = canvas.getBoundingClientRect();
        c.drawImage(reveal, r.left - ox, r.top - oy, r.width, r.height);
      },
    };
    sources?.add(source);

    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) draw();
    });
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    lensMedia.addEventListener("change", draw);
    return () => {
      cancelled = true;
      ro.disconnect();
      lensMedia.removeEventListener("change", draw);
      sources?.delete(source);
    };
  }, [lines, fontVar, color, sources]);

  return (
    <div
      ref={boxRef}
      className="relative max-w-none"
      style={{ width: `${(1 + TAIL) * 100}%`, aspectRatio: "2.55 / 1" }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute block"
        style={{
          top: -LENS,
          left: -LENS,
          width: `calc(100% + ${2 * LENS}px)`,
          height: `calc(100% + ${2 * LENS}px)`,
        }}
      />
    </div>
  );
}
