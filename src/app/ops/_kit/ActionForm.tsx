"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Label, inputCls } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import type { OpsState } from "./state";

// One form for every audited /ops change: posts to a server action that
// returns OpsState, carries a fresh idempotency key per submit, and shows the
// receipt (id + server time) or the error in text, never colour alone.

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(iso));

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function ActionForm({
  action,
  children,
  submit,
  pending = "Working…",
  className = "",
  variant = "primary",
  confirm,
  render,
}: {
  action: (prev: OpsState, form: FormData) => Promise<OpsState>;
  /** Fields. A function gets the last state (to show a preview, keep values…). */
  children?: ReactNode | ((state: OpsState) => ReactNode);
  submit: ReactNode;
  pending?: ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Ask before submitting (destructive or irreversible changes). */
  confirm?: string;
  /** Custom result rendering (default: receipt line). */
  render?: (state: NonNullable<OpsState>) => ReactNode;
}) {
  const [state, formAction] = useActionState<OpsState, FormData>(action, null);
  // A new key after each successful submit; a retry of a failed one reuses it.
  const [key, setKey] = useState(newKey);
  const [lastOk, setLastOk] = useState<OpsState>(null);
  if (state && state !== lastOk && state.ok) {
    setLastOk(state);
    setKey(newKey());
  }
  return (
    <form
      action={formAction}
      className={`space-y-4 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="idempotency_key" value={key} />
      {typeof children === "function" ? children(state) : children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit variant={variant} pending={pending}>
          {submit}
        </Submit>
      </div>
      <Result state={state} render={render} />
    </form>
  );
}

function Submit({ children, pending, variant }: { children: ReactNode; pending: ReactNode; variant: "primary" | "secondary" | "danger" }) {
  const { pending: busy } = useFormStatus();
  const cls = {
    primary: "bg-bright text-ink hover:bg-lime",
    secondary: "border border-hairline text-bright hover:border-lime hover:text-lime",
    danger: "border border-danger text-danger hover:bg-danger-deep",
  }[variant];
  return (
    <button type="submit" disabled={busy} className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 font-plex text-sm transition-colors disabled:cursor-wait disabled:opacity-60 ${cls}`}>
      {busy ? pending : children}
    </button>
  );
}

export function Result({ state, render }: { state: OpsState; render?: (s: NonNullable<OpsState>) => ReactNode }) {
  if (!state) return null;
  if (render && state.ok) return <div role="status">{render(state)}</div>;
  if (!state.ok) {
    return (
      <div role="alert" className="space-y-1 border-l-2 border-danger pl-3 font-plex text-sm text-danger">
        <p>
          <span aria-hidden="true">✕ </span>
          {state.message}
        </p>
        {state.issues?.map((i) => (
          <p key={i.path + i.message} className="text-xs">
            {i.path ? `${i.path}: ` : ""}
            {i.message}
          </p>
        ))}
      </div>
    );
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 font-plex text-sm text-bright">
      <StatusPill tone="accent">Done</StatusPill>
      <span>{state.message}</span>
      {state.receipt && (
        <span className="text-xs text-lightgray">
          Receipt <span className="text-bright">{state.receipt.id}</span> · {fmt(state.receipt.server_time)}
        </span>
      )}
    </p>
  );
}

/** Required "why" field for audited changes. */
export function ReasonField({ id, placeholder = "Why? (goes in the audit log)", defaultValue }: { id: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div>
      <Label htmlFor={id} hint="required · audited">
        Reason
      </Label>
      <input id={id} name="reason" required minLength={3} maxLength={300} placeholder={placeholder} defaultValue={defaultValue} className={`${inputCls} min-h-11`} />
    </div>
  );
}

export function TextField({
  id,
  name,
  label,
  hint,
  required,
  type = "text",
  defaultValue,
  placeholder,
  maxLength = 200,
  autoComplete = "off",
  inputMode,
}: {
  id: string;
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric" | "search";
}) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={`${inputCls} min-h-11`}
      />
    </div>
  );
}

export function SelectField({ id, name, label, options, defaultValue, hint }: { id: string; name: string; label: ReactNode; options: { value: string; label: string }[]; defaultValue?: string; hint?: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <select id={id} name={name} defaultValue={defaultValue} className={`${inputCls} min-h-11`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextArea({ id, name, label, hint, rows = 3, maxLength = 1000, defaultValue, required, placeholder }: { id: string; name: string; label: ReactNode; hint?: ReactNode; rows?: number; maxLength?: number; defaultValue?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <textarea id={id} name={name} rows={rows} maxLength={maxLength} defaultValue={defaultValue} required={required} placeholder={placeholder} className={inputCls} />
    </div>
  );
}
