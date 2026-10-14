"use client";

import { useSyncExternalStore } from "react";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function getParts(target: number, now: number): Parts {
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

// Snapshot in whole seconds so the store only changes once per tick.
const getSnapshot = () => Math.floor(Date.now() / 1000) * 1000;
// Server has no clock to agree with the client, so render placeholders.
const getServerSnapshot = () => null;

export default function Countdown({ target }: { target: string }) {
  const ts = new Date(target).getTime();
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const parts = now === null ? null : getParts(ts, now);

  const cells: { label: string; value: number | null }[] = [
    { label: "Days", value: parts?.days ?? null },
    { label: "Hours", value: parts?.hours ?? null },
    { label: "Minutes", value: parts?.minutes ?? null },
    { label: "Seconds", value: parts?.seconds ?? null },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 sm:gap-4" aria-live="polite">
      {cells.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-white/10 bg-white/5 px-2 py-4 text-center"
        >
          <div className="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
            {c.value === null ? "--" : String(c.value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wider text-zinc-400">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
