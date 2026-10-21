"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LENS, LENS_MEDIA, RING, attachLens, drawLens } from "./lens";

// One hover lens for the whole hero. Pieces of the hero (hands, wordmark,
// text) register as sources; the lens opens while the pointer is over any of
// them and glides between them, showing each source's lime rendering.

export type LensSource = {
  /** Paint order inside the lens: photos (0) under type (1). */
  layer: number;
  /** Is this client-space point on the source? */
  hit: (clientX: number, clientY: number) => boolean;
  /** Draw the lens rendering; (ox, oy) is the overlay's client-space origin. */
  draw: (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void;
};

const SourcesContext = createContext<Set<LensSource> | null>(null);

/** Register `source` with the enclosing HeroLens for as long as it is mounted. */
export function useLensSources() {
  return useContext(SourcesContext);
}

export default function HeroLens({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [sources] = useState(() => new Set<LensSource>());
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!section || !canvas || !ctx) return;
    const mono = getComputedStyle(canvas).getPropertyValue("--font-plex-mono").trim() || "monospace";
    const media = window.matchMedia(LENS_MEDIA);
    let w = 0;
    let h = 0;

    const size = () => {
      const rect = section.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lens.repaint();
    };

    const lens = attachLens(
      section,
      (x, y) => {
        if (!media.matches) return false;
        const r = section.getBoundingClientRect();
        for (const s of sources) if (s.hit(x + r.left, y + r.top)) return true;
        return false;
      },
      (x, y, open) => {
        ctx.clearRect(0, 0, w, h);
        drawLens(ctx, x, y, open, mono, () => {
          const r = section.getBoundingClientRect();
          ctx.fillStyle = RING;
          ctx.fillRect(x - LENS, y - LENS, 2 * LENS, 2 * LENS);
          for (const s of [...sources].sort((a, b) => a.layer - b.layer)) s.draw(ctx, r.left, r.top);
        });
      },
    );

    const ro = new ResizeObserver(size);
    ro.observe(section);
    return () => {
      ro.disconnect();
      lens.dispose();
    };
  }, [sources]);

  return (
    <SourcesContext.Provider value={sources}>
      <section ref={sectionRef} id={id} className={className}>
        {children}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 block h-full w-full"
        />
      </section>
    </SourcesContext.Provider>
  );
}
