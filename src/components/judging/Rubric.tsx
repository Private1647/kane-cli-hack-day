"use client";

import { useEffect, useRef, useState } from "react";
import { judging } from "@/data/hackday";

// The rubric as horizontal bars scaled to points, each with what judges
// inspect, then the 0–5 anchor scale. Bars grow in once visible.
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
      <ol ref={ref} className="space-y-4" aria-label={`Rubric, ${total} points`}>
        {judging.rubric.map((r, i) => (
          <li key={r.key}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="relative h-11 bg-surface">
                <div
                  className={`absolute inset-y-0 left-0 origin-left ${i === 0 ? "bg-lime" : "bg-[#2a2b2d]"} ${shown ? "animate-grow" : "scale-x-0"}`}
                  style={{ width: `${(r.points / max) * 100}%`, animationDelay: `${i * 90}ms` }}
                />
                <span className={`relative flex h-full items-center px-3 font-plex text-sm ${i === 0 ? "text-ink" : "text-bright"}`}>{r.name}</span>
              </div>
              <span className="w-10 text-right font-dots text-3xl leading-none font-black text-bright">{r.points}</span>
            </div>
            <p className="mt-1.5 pr-14 font-plex text-xs leading-relaxed text-lightgray">{r.inspect}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-t border-dashed border-hairline pt-5">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Anchors · points = anchor × weight / 5</p>
        <ol className="mt-3 grid grid-cols-3 gap-px border border-hairline bg-hairline sm:grid-cols-6" aria-label="Anchor scale">
          {judging.anchors.map((a) => (
            <li key={a.score} className="bg-ink px-2 py-3 text-center">
              <span className="block font-dots text-2xl leading-none font-black text-bright">{a.score}</span>
              <span className="mt-1 block font-plex text-[11px] text-lightgray">{a.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 font-plex text-xs leading-relaxed text-lightgray">{judging.scoringNote}</p>
      </div>

      <p className="mt-4 text-right font-plex text-xs text-lightgray">
        {total} points · {judging.shippedNote}
      </p>
    </div>
  );
}
