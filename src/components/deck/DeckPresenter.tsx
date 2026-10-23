"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// The public deck presenter (T-DECK-02). Slides arrive pre-rendered from the
// server; this adds navigation only:
//   ← → / PageUp PageDown / Space / Home End (presenter remotes send these),
//   swipe on touch, an outline, fullscreen, speaker notes, #n deep links,
//   and print: every slide on its own 16:9 page (= PDF via Save as PDF).

export default function DeckPresenter({
  slides,
  titles,
  notes,
  printMode,
  label,
}: {
  slides: ReactNode[];
  titles: string[];
  notes: string[];
  printMode: boolean;
  label: string;
}) {
  const total = slides.length;
  const [i, setI] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [outline, setOutline] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(total - 1, n))), [total]);

  // Deep link: #3 opens slide 3.
  useEffect(() => {
    const sync = () => {
      const n = parseInt(window.location.hash.slice(1), 10);
      if (n > 0 && n <= total) setI(n - 1);
    };
    const id = requestAnimationFrame(sync);
    window.addEventListener("hashchange", sync);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("hashchange", sync);
    };
  }, [total]);
  useEffect(() => {
    if (!printMode) window.history.replaceState(null, "", `#${i + 1}`);
  }, [i, printMode]);

  useEffect(() => {
    if (printMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(i + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(i - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(total - 1);
      else if (e.key.toLowerCase() === "f") stage.current?.requestFullscreen?.().catch(() => {});
      else if (e.key.toLowerCase() === "n") setShowNotes((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go, total, printMode]);

  return (
    <div>
      {printMode ? (
        <div className="no-print container-page flex flex-wrap items-center gap-3 py-4">
          <p className="font-plex text-sm text-lightgray">Print view: one slide per page. Choose Save as PDF in the print dialog.</p>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
            Print / Save as PDF
          </button>
        </div>
      ) : (
        <div className="no-print container-page flex flex-wrap items-center gap-2 py-4" role="toolbar" aria-label="Deck controls">
          <Btn onClick={() => go(i - 1)} disabled={i === 0} label="Previous slide">
            ← Prev
          </Btn>
          <Btn onClick={() => go(i + 1)} disabled={i === total - 1} label="Next slide">
            Next →
          </Btn>
          <span className="px-2 font-dots text-xl font-black text-bright" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </span>
          <Btn onClick={() => stage.current?.requestFullscreen?.().catch(() => {})} label="Present full screen (F)">
            Present
          </Btn>
          <Btn onClick={() => setOutline((v) => !v)} pressed={outline} label="Slide outline">
            Outline
          </Btn>
          <Btn onClick={() => setShowNotes((v) => !v)} pressed={showNotes} label="Speaker notes (N)">
            Notes
          </Btn>
          <a href="?print=1" className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            PDF
          </a>
          <span className="ml-auto font-plex text-xs text-lightgray">{label}</span>
        </div>
      )}

      {outline && !printMode && (
        <nav aria-label="Slide outline" className="no-print container-page pb-4">
          <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {titles.map((t, n) => (
              <li key={n}>
                <button type="button" onClick={() => go(n)} aria-current={n === i ? "true" : undefined} className={`flex min-h-11 w-full items-center gap-3 border px-3 text-left font-plex text-sm ${n === i ? "border-lime text-lime" : "border-hairline text-bright hover:border-bright"}`}>
                  <span className="font-dots font-black">{n + 1}</span>
                  <span className="truncate">{t}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div
        ref={stage}
        className={printMode ? "container-page print:w-full" : "container-page bg-ink print:w-full [&:fullscreen]:flex [&:fullscreen]:w-full [&:fullscreen]:max-w-none [&:fullscreen]:items-center [&:fullscreen]:justify-center"}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
          touch.current = null;
        }}
      >
        <div className={printMode ? "" : "w-full [:fullscreen_&]:max-w-[calc(100vh*16/9)]"}>
          {slides.map((s, n) => (
            <div key={n} className={`break-after-page ${printMode ? "mb-6 print:mb-0" : n === i ? "" : "hidden print:block"}`} aria-hidden={!printMode && n !== i ? true : undefined}>
              {s}
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {printMode ? "" : `Slide ${i + 1} of ${total}: ${titles[i]}`}
      </p>
      {showNotes && !printMode && (
        <aside aria-label="Speaker notes" className="no-print container-page py-4">
          <p className="border-l-2 border-hairline pl-3 font-plex text-sm whitespace-pre-line text-lightgray">{notes[i] || "No notes for this slide."}</p>
        </aside>
      )}
    </div>
  );
}

function Btn({ onClick, disabled, pressed, label, children }: { onClick: () => void; disabled?: boolean; pressed?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex min-h-11 items-center border px-3 font-plex text-sm transition-colors disabled:opacity-30 ${pressed ? "border-lime text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
    >
      {children}
    </button>
  );
}
