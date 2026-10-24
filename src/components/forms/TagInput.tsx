"use client";

import { useId, useState, type KeyboardEvent } from "react";

// A comma-list field with chips and type-ahead suggestions. Submits one hidden
// input `name` holding the comma-joined list (the same shape as the old text
// field), including whatever is still being typed.

const MAX = 12;

function rank(options: string[], draft: string, taken: string[]) {
  const q = draft.trim().toLowerCase();
  if (!q) return [];
  const free = options.filter((o) => !taken.includes(o));
  const starts = free.filter((o) => o.startsWith(q));
  const words = free.filter((o) => !o.startsWith(q) && o.split(/[\s./-]/).some((w) => w.startsWith(q)));
  return [...starts, ...words].slice(0, 8);
}

export default function TagInput({ id, name, defaultValue, options, placeholder, className = "" }: { id: string; name: string; defaultValue: string; options: string[]; placeholder?: string; className?: string }) {
  const [tags, setTags] = useState(() => [...new Set(defaultValue.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, MAX));
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = rank(options, draft, tags);
  const showList = open && matches.length > 0;

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (t && !tags.includes(t) && tags.length < MAX) setTags([...tags, t]);
    setDraft("");
    setActive(0);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "," || (e.key === "Tab" && showList)) {
      if (!draft.trim()) return;
      e.preventDefault();
      add(showList ? matches[active] : draft);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !draft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={[...tags, draft.trim()].filter(Boolean).join(", ")} />
      <div className={`flex flex-wrap items-center gap-2 border border-hairline bg-surface px-3 py-2 transition-colors focus-within:border-lime ${className}`}>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 border border-lime/50 bg-lime-deep py-1 pl-2.5 pr-1 font-plex text-sm text-bright">
            {t}
            <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="inline-flex h-6 w-6 items-center justify-center text-lightgray hover:text-lime">
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) {
              v.split(",").slice(0, -1).forEach(add);
              setDraft(v.split(",").pop() ?? "");
            } else setDraft(v);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          disabled={tags.length >= MAX && !draft}
          placeholder={tags.length ? (tags.length >= MAX ? `Up to ${MAX}` : "Add another…") : placeholder}
          autoComplete="off"
          className="min-h-9 min-w-[10ch] flex-1 bg-transparent font-plex text-base text-bright outline-none placeholder:text-lightgray/60 focus:outline-none focus-visible:outline-none"
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto border border-hairline bg-surface-2 shadow-lg">
          {matches.map((m, i) => (
            <li
              key={m}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2.5 font-plex text-base ${i === active ? "bg-lime-deep text-lime" : "text-bright"}`}
            >
              <strong className="font-semibold">{m.slice(0, draft.trim().length) === draft.trim().toLowerCase() ? m.slice(0, draft.trim().length) : ""}</strong>
              {m.slice(0, draft.trim().length) === draft.trim().toLowerCase() ? m.slice(draft.trim().length) : m}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 font-plex text-xs text-lightgray">Type a few letters and pick a suggestion, or press Enter to add your own.</p>
    </div>
  );
}
