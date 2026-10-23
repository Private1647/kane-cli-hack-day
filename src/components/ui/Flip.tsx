"use client";

import { useState, type ReactNode } from "react";

// A two-sided card (passport front/back). The whole card is a button, so
// click, Enter and Space all flip it; the hidden face is hidden from AT too.
// Uses .flip-card styles in globals.css (instant under reduced motion).
export default function Flip({
  front,
  back,
  label = "Flip card",
  className = "",
}: {
  front: ReactNode;
  back: ReactNode;
  label?: string;
  className?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`flip-card ${className}`} data-flipped={flipped}>
      <div className="flip-card-inner">
        <div className="flip-card-face" aria-hidden={flipped} inert={flipped}>
          {front}
        </div>
        <div className="flip-card-face flip-card-back" aria-hidden={!flipped} inert={!flipped}>
          {back}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
        className="mt-3 inline-flex min-h-11 items-center gap-2 border border-hairline px-3 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime"
      >
        <span aria-hidden="true">↻</span> {label} · {flipped ? "show front" : "show back"}
      </button>
    </div>
  );
}
