"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { FormError, SubmitButton, inputCls } from "@/components/forms/fields";
import CopyField from "@/components/ui/CopyField";
import { addTeammate, joinTeam, leaveTeam, pickMember, switchMember, updateItem, type FormState } from "./actions";

export function JoinForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<FormState, FormData>(joinTeam.bind(null, slug), null);
  return (
    <form action={action} className="space-y-4">
      <input
        name="password"
        type="password"
        aria-label="Team password"
        required
        autoFocus
        autoComplete="current-password"
        placeholder="Team password"
        className={inputCls}
      />
      <FormError message={state?.error} />
      <SubmitButton pending="Checking…">Open team page →</SubmitButton>
    </form>
  );
}

export function PickMember({ slug, members }: { slug: string; members: { id: number; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(pickMember.bind(null, slug), null);
  return (
    <form action={action} className="space-y-4">
      <select name="memberId" aria-label="Your name" required defaultValue="" className={inputCls}>
        <option value="" disabled>
          Select your name
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <FormError message={state?.error} />
      <SubmitButton pending="Signing in…">That’s me →</SubmitButton>
    </form>
  );
}

export function SessionButtons({ slug, compact = false }: { slug: string; compact?: boolean }) {
  return (
    <div className={`flex gap-4 font-plex text-xs ${compact ? "mt-1" : "mt-4"}`}>
      <form action={switchMember.bind(null, slug)}>
        <button type="submit" className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
          Not you? Switch
        </button>
      </form>
      <form action={leaveTeam}>
        <button type="submit" className="text-lightgray underline decoration-hairline underline-offset-4 hover:text-lime">
          Lock this device
        </button>
      </form>
    </div>
  );
}

/** One checklist row: tick, link, save. The parent keys it on updated_at so a teammate's save resets it. */
export function ProgressRow({
  slug,
  item,
  deadline,
  value,
  done,
  by,
  readOnly = false,
}: {
  slug: string;
  item: { id: string; label: string; placeholder: string };
  deadline: string;
  value: string;
  done: boolean;
  by: string | null;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(updateItem.bind(null, slug), null);
  const [draft, setDraft] = useState(value);
  const [checked, setChecked] = useState(done);
  const dirty = draft !== value || checked !== done;

  return (
    <li className="border-b border-dashed border-hairline py-4">
      <form action={action} className="space-y-3">
        <fieldset disabled={readOnly} className="contents">
        <input type="hidden" name="item" value={item.id} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="done"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--lime)]"
            />
            <span className={`font-plex text-sm ${checked ? "text-lime" : "text-bright"}`}>{item.label}</span>
          </label>
          <span className="font-plex text-xs text-lightgray">{by ?? `Due ${deadline}`}</span>
        </div>
        <div className="flex gap-2">
          <input
            name="value"
            aria-label={`${item.label} link`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={item.placeholder}
            maxLength={500}
            className={inputCls}
          />
          <SubmitButton pending="…" className={dirty ? "" : "pointer-events-none opacity-40"}>
            Save
          </SubmitButton>
        </div>
        <FormError message={state?.error} />
        </fieldset>
      </form>
    </li>
  );
}

export function AddTeammate({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(addTeammate.bind(null, slug), null);
  // Controlled so an error (e.g. email taken) doesn't clear what was typed.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 border border-dashed border-hairline px-3 py-1.5 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime"
      >
        + Add teammate
      </button>
    );
  return (
    <form action={action} className="mt-3 space-y-2">
      <input name="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Teammate name" required maxLength={40} placeholder="Name" className={inputCls} />
      <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Teammate email" required placeholder="email@example.com" className={inputCls} />
      <FormError message={state?.error} />
      <div className="flex gap-3">
        <SubmitButton pending="Adding…">Add</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="font-plex text-xs text-lightgray hover:text-bright">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Pulls teammates' changes in the background while the tab is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

const noop = () => () => {};

export function CopyLink({ path }: { path: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  return <CopyField value={`${origin}${path}`} />;
}
