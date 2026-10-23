"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// The media stage with the Creation / Proof switch (ARIA tabs: arrow keys move,
// Home/End jump). "#proof" in the URL (the hero's "See the proof" link) opens
// the proof side. Screenshots are real submitted captures; when there are
// none, the stage says so instead of drawing a fake product.

export type StageShot = { src: string; alt: string };
export type StageVideo = { kind: "iframe" | "file" | "link"; src: string; title: string };

const TABS = [
  { id: "creation", label: "The creation" },
  { id: "proof", label: "The proof" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Stage({ shots, video, proof, projectName }: { shots: StageShot[]; video: StageVideo | null; proof: ReactNode; projectName: string }) {
  const [tab, setTab] = useState<Tab>("creation");
  const [i, setI] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#proof") setTab("proof");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function onKey(e: KeyboardEvent) {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    refs.current[next]?.focus();
  }

  const media: ({ type: "shot"; shot: StageShot } | { type: "video"; video: StageVideo })[] = [
    ...(video && video.kind !== "link" ? [{ type: "video" as const, video }] : []),
    ...shots.map((shot) => ({ type: "shot" as const, shot })),
  ];
  const cur = media[Math.min(i, Math.max(0, media.length - 1))];

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label="Switch view" onKeyDown={onKey} className="inline-flex border border-hairline bg-surface-2">
        {TABS.map((t, n) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[n] = el;
              }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`min-h-11 px-4 font-plex text-sm transition-colors ${on ? "bg-lime-deep text-lime outline outline-1 -outline-offset-1 outline-lime" : "text-lightgray hover:text-bright"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="brackets mt-4 border border-hairline bg-surface p-3 sm:p-5">
        <div id="panel-creation" role="tabpanel" aria-labelledby="tab-creation" hidden={tab !== "creation"} tabIndex={0}>
          {cur ? (
            <>
              <div className="relative aspect-video w-full overflow-hidden bg-ink">
                {cur.type === "video" ? (
                  cur.video.kind === "iframe" ? (
                    <iframe
                      src={cur.video.src}
                      title={cur.video.title}
                      className="h-full w-full"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      referrerPolicy="strict-origin-when-cross-origin"
                      loading="lazy"
                      allowFullScreen
                    />
                  ) : (
                    <video src={cur.video.src} controls preload="metadata" className="h-full w-full" aria-label={cur.video.title} />
                  )
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- private blob through an access-checked route
                  <img src={cur.shot.src} alt={cur.shot.alt} className="h-full w-full object-contain" />
                )}
              </div>
              {media.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Media">
                  {media.map((m, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setI(n)}
                      aria-pressed={n === i}
                      aria-label={m.type === "video" ? "Demo video" : `Screenshot ${n + (media[0].type === "video" ? 0 : 1)}: ${m.shot.alt}`}
                      className={`grid h-11 min-w-11 place-items-center border px-2 font-dots text-sm transition-colors ${n === i ? "border-lime text-lime" : "border-hairline text-lightgray hover:text-bright"}`}
                    >
                      {m.type === "video" ? "▶" : String(n + (media[0].type === "video" ? 0 : 1)).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid aspect-video place-items-center border border-dashed border-hairline p-6 text-center">
              <div>
                <p className="font-dots text-5xl font-black text-hairline" aria-hidden>
                  {projectName.slice(0, 1).toUpperCase()}
                </p>
                <p className="mt-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">No screenshots submitted</p>
              </div>
            </div>
          )}
          {video?.kind === "link" && (
            <a href={video.src} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center font-plex text-sm text-bright underline underline-offset-4 hover:text-lime">
              Watch the demo video ↗
            </a>
          )}
        </div>
        <div id="panel-proof" role="tabpanel" aria-labelledby="tab-proof" hidden={tab !== "proof"} tabIndex={0}>
          {proof}
        </div>
      </div>
    </div>
  );
}

/** Copy this page's URL. */
export function CopyUrl({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          window.prompt(label, url);
        }
      }}
      className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
