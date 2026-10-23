"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// The Product × Proof hero switch: "See creation" / "See verification".
// WAI-ARIA tabs: arrow keys / Home / End move between tabs, both panels stay
// in the DOM (the inactive one is hidden), so it works without JS too.

export default function CreationProofTabs({ creation, proof }: { creation: ReactNode; proof: ReactNode }) {
  const id = useId();
  const [tab, setTab] = useState<0 | 1>(0);
  const refs = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)];
  const labels = ["See creation", "See verification"];

  const onKey = (e: KeyboardEvent) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowLeft" ? ((1 - tab) as 0 | 1) : e.key === "Home" ? 0 : e.key === "End" ? 1 : null;
    if (next === null) return;
    e.preventDefault();
    setTab(next);
    refs[next].current?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Creation or verification" className="inline-flex border border-hairline" onKeyDown={onKey}>
        {labels.map((l, i) => (
          <button
            key={l}
            ref={refs[i]}
            id={`${id}-t${i}`}
            role="tab"
            type="button"
            aria-selected={tab === i}
            aria-controls={`${id}-p${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i as 0 | 1)}
            className={`min-h-11 px-4 font-plex text-sm transition-colors ${tab === i ? "bg-lime text-ink" : "text-lightgray hover:text-bright"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {[creation, proof].map((panel, i) => (
        <div key={i} id={`${id}-p${i}`} role="tabpanel" aria-labelledby={`${id}-t${i}`} hidden={tab !== i} className="mt-6">
          {panel}
        </div>
      ))}
    </div>
  );
}
