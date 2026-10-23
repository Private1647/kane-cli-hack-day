"use client";

import { useId, type ReactNode } from "react";
import { inputCls, Label } from "@/components/forms/fields";

// Small editors shared by the studio pages: text, textarea, a list of
// strings with add / remove / reorder, and a section frame. All controls are
// ≥44px tall and labelled.

export function Field({
  label,
  hint,
  value,
  onChange,
  max,
  placeholder,
  disabled,
  multiline = false,
  rows = 3,
  type = "text",
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
}) {
  const id = useId();
  const count = max ? `${value.length}/${max}` : undefined;
  return (
    <div>
      <Label htmlFor={id} hint={hint ?? count}>
        {label}
      </Label>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} rows={rows} placeholder={placeholder} disabled={disabled} className={`${inputCls} min-h-11 resize-y`} />
      ) : (
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} disabled={disabled} className={`${inputCls} min-h-11`} />
      )}
    </div>
  );
}

export function ListField({
  label,
  values,
  onChange,
  max = 8,
  itemMax = 300,
  placeholder,
  disabled,
  addLabel = "Add",
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  max?: number;
  itemMax?: number;
  placeholder?: string;
  disabled?: boolean;
  addLabel?: string;
}) {
  const set = (i: number, v: string) => onChange(values.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">
        {label} <span className="font-plex normal-case tracking-normal">({values.length}/{max})</span>
      </legend>
      <ol className="space-y-2">
        {values.map((v, i) => (
          <li key={i} className="flex items-stretch gap-1">
            <span className="flex w-8 shrink-0 items-center justify-center font-dots text-lg font-black text-lightgray">{i + 1}</span>
            <input
              aria-label={`${label} ${i + 1}`}
              value={v}
              maxLength={itemMax}
              placeholder={placeholder}
              onChange={(e) => set(i, e.target.value)}
              className={`${inputCls} min-h-11 min-w-0 flex-1`}
            />
            <IconButton label={`Move ${label} ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </IconButton>
            <IconButton label={`Move ${label} ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === values.length - 1}>
              ↓
            </IconButton>
            <IconButton label={`Remove ${label} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
              ✕
            </IconButton>
          </li>
        ))}
      </ol>
      {values.length < max && (
        <button type="button" onClick={() => onChange([...values, ""])} className="mt-2 inline-flex min-h-11 items-center border border-dashed border-hairline px-3 font-plex text-sm text-lightgray hover:border-lime hover:text-lime">
          + {addLabel}
        </button>
      )}
    </fieldset>
  );
}

export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-hairline font-plex text-sm text-lightgray transition-colors hover:border-lime hover:text-lime disabled:opacity-30 disabled:hover:border-hairline disabled:hover:text-lightgray"
    >
      {children}
    </button>
  );
}

export function Panel({ id, eyebrow, title, intro, children, aside }: { id?: string; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-dashed border-hairline py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">{eyebrow}</p>
          <h2 className="mt-2 font-display text-2xl text-bright sm:text-3xl">{title}</h2>
          {intro && <div className="mt-2 font-plex text-sm leading-relaxed text-lightgray">{intro}</div>}
        </div>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Select<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} className={`${inputCls} min-h-11`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Action result line: lime receipt on success, red on a confirmed error. */
export function ResultLine({ ok, message, receipt }: { ok: boolean; message: string; receipt?: string | null }) {
  return (
    <p role={ok ? "status" : "alert"} className={`border-l-2 pl-3 font-plex text-sm ${ok ? "border-lime text-bright" : "border-danger text-danger"}`}>
      {message}
      {receipt && <span className="ml-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">Receipt {receipt}</span>}
    </p>
  );
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
