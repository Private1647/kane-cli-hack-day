"use client";

import { useEffect, useRef } from "react";
import { useLensSources } from "./HeroLens";

// A line of text that takes part in the hero lens: under the lens it is
// redrawn in dark ink on the lens's lime, matching the wordmark.

const INK = "#1f2606";
const PAD = 8; // px of slack around the text that still counts as a hit

export default function LensText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const sources = useLensSources();

  useEffect(() => {
    const el = ref.current;
    if (!el || !sources) return;
    const textRect = () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const source = {
      layer: 1,
      hit: (x: number, y: number) => {
        const r = textRect();
        return x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD;
      },
      draw: (ctx: CanvasRenderingContext2D, ox: number, oy: number) => {
        const cs = getComputedStyle(el);
        const r = textRect();
        ctx.save();
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
        ctx.fillStyle = INK;
        ctx.textBaseline = "middle";
        const shown = cs.textTransform === "uppercase" ? text.toUpperCase() : text;
        ctx.fillText(shown, r.left - ox, r.top - oy + r.height / 2);
        ctx.restore();
      },
    };
    sources.add(source);
    return () => {
      sources.delete(source);
    };
  }, [sources, text]);

  return (
    <p ref={ref} className={className}>
      {text}
    </p>
  );
}
