"use client";

import { useEffect, useRef, useState } from "react";

// Text that "decodes" from random glyphs into its final characters, left to
// right, the first time it scrolls into view — a nod to the CLI boot log.

const GLYPHS = "01#%&*+=<>/\\_-:.";
const STEP_MS = 28;

export default function Decode({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let frame = 0;
        const total = text.length + 8;
        timer = window.setInterval(() => {
          frame++;
          setShown(
            [...text]
              .map((ch, i) =>
                ch === " " || i < frame - 8 ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
              )
              .join(""),
          );
          if (frame >= total) {
            window.clearInterval(timer);
            setShown(text);
          }
        }, STEP_MS);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [text]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
