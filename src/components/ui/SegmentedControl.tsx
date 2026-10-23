"use client";

import { useRef, type KeyboardEvent } from "react";

// Square hairline segments; the selected one is lime (you are here).
// A radiogroup: Tab enters it, arrow keys move and select.
export default function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);

  function onKey(e: KeyboardEvent) {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (idx + d + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className={`inline-flex flex-wrap border border-hairline bg-surface-2 ${className}`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`min-h-11 px-4 font-plex text-sm transition-colors ${
              on ? "bg-lime-deep text-lime outline outline-1 -outline-offset-1 outline-lime" : "text-lightgray hover:text-bright"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
