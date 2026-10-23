"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { event } from "@/data/hackday";
import { markNotificationsSeen } from "./actions";

// The hub's notification bell: new event photos of the team, organiser nudges,
// and pinned to-dos. Polls while the tab is visible and pops a toast for anything new.

type Item = { id: number | string; kind: string; title: string; body: string; href: string | null; image: string | null; send_at: string; unread: boolean };
type Feed = { pinned: Item[]; feed: Item[]; unread: number };

const POLL_MS = 30_000;
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

export default function Bell({ slug }: { slug: string }) {
  const [data, setData] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Item | null>(null);
  const known = useRef<Set<string | number> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/t/${slug}/notifications`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const next = (await r.json()) as Feed;
    // Toast the newest unseen item, but not on first load.
    if (known.current) {
      const fresh = next.feed.find((n) => n.unread && !known.current!.has(n.id));
      if (fresh) setToast(fresh);
    }
    known.current = new Set(next.feed.map((n) => n.id));
    setData(next);
  }, [slug]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    setToast(null);
    if (next && data?.unread) {
      markNotificationsSeen(slug).catch(() => {});
      // Keep the dots on what was unread while the panel is open; clear the count.
      setData((d) => (d ? { ...d, unread: 0 } : d));
    }
    if (!next) setData((d) => (d ? { ...d, feed: d.feed.map((n) => ({ ...n, unread: false })) } : d));
  }

  const count = (data?.unread ?? 0) + (data?.pinned.length ?? 0);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Notifications${count ? `, ${count} new` : ""}`}
        className={`relative grid h-9 w-9 place-items-center border transition-colors ${open ? "border-lime text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-lime px-1 font-plex text-[10px] font-semibold text-ink">{count}</span>
        )}
      </button>

      {open && data && (
        <div className="absolute right-0 top-11 z-40 w-[min(92vw,380px)] border border-hairline bg-ink shadow-2xl">
          <p className="border-b border-dashed border-hairline px-4 py-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Notifications</p>
          <ul className="max-h-[70vh] overflow-y-auto">
            {data.pinned.map((n) => (
              <Row key={n.id} n={n} pinned onClick={() => setOpen(false)} />
            ))}
            {data.feed.map((n) => (
              <Row key={n.id} n={n} onClick={() => setOpen(false)} />
            ))}
            {!data.pinned.length && !data.feed.length && <li className="px-4 py-6 font-plex text-sm text-lightgray">Nothing yet. Photos of your team will show up here.</li>}
          </ul>
        </div>
      )}

      {toast && !open && (
        <div role="status" className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] gap-3 border border-lime bg-ink p-3 shadow-2xl">
          {toast.image && (
            // eslint-disable-next-line @next/next/no-img-element -- private photo proxy
            <img src={toast.image} alt="" className="h-16 w-16 shrink-0 object-cover" />
          )}
          <div className="min-w-0 flex-1 font-plex text-sm">
            <p className="text-lime">{toast.title}</p>
            {toast.body && <p className="mt-1 line-clamp-2 text-xs text-lightgray">{toast.body}</p>}
            {toast.href && (
              <Link href={toast.href} onClick={() => setToast(null)} className="mt-2 inline-block text-xs text-bright underline underline-offset-4 hover:text-lime">
                {toast.kind === "photo" ? "See photo →" : "Open →"}
              </Link>
            )}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="self-start px-1 text-lightgray hover:text-bright">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ n, pinned = false, onClick }: { n: Item; pinned?: boolean; onClick: () => void }) {
  const inner = (
    <div className="flex gap-3 px-4 py-3">
      {n.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- private photo proxy
        <img src={n.image} alt="" className="h-12 w-12 shrink-0 object-cover" />
      ) : (
        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 ${pinned ? "bg-amber-400" : n.unread ? "bg-lime" : "bg-hairline"}`} />
      )}
      <div className="min-w-0 flex-1 font-plex">
        <p className={`text-sm ${n.unread || pinned ? "text-bright" : "text-lightgray"}`}>{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-lightgray">{n.body}</p>}
        <p className="mt-1 font-pixel text-[9px] uppercase tracking-[0.2em] text-lightgray">{pinned ? "To do" : time.format(new Date(n.send_at))}</p>
      </div>
    </div>
  );
  return (
    <li className="border-b border-dashed border-hairline last:border-b-0">
      {n.href ? (
        <Link href={n.href} onClick={onClick} className="block transition-colors hover:bg-surface">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
