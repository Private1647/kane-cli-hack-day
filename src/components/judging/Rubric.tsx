"use client";

import { useEffect, useRef, useState } from "react";
import { judging } from "@/data/hackday";

// The rubric as horizontal bars scaled to points; bars grow in once visible.
export default function Rubric() {
  const ref = useRef<HTMLOListElement>(null);
  const [shown, setShown] = useState(false);
  const max = Math.max(...judging.rubric.map((r) => r.points));
  const total = judging.rubric.reduce((n, r) => n + r.points, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setShown(true);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>
      <ol ref={ref} className="space-y-3" aria-label={`Rubric, ${total} points`}>
        {judging.rubric.map((r, i) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="relative h-11 bg-surface">
              <div
                className={`absolute inset-y-0 left-0 origin-left ${i === 0 ? "bg-lime" : "bg-[#2a2b2d]"} ${shown ? "animate-grow" : "scale-x-0"}`}
                style={{ width: `${(r.points / max) * 100}%`, animationDelay: `${i * 90}ms` }}
              />
              <span className={`relative flex h-full items-center px-3 font-plex text-sm ${i === 0 ? "text-ink" : "text-bright"}`}>
                {r.label}
              </span>
            </div>
            <span className="w-10 text-right font-dots text-3xl leading-none font-black text-bright">{r.points}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-right font-plex text-xs text-lightgray">
        {total} points · {judging.shippedNote}
      </p>
    </div>
  );
}
