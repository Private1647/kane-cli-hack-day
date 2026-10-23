"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { FormError, SubmitButton, inputCls } from "@/components/forms/fields";
import CopyField from "@/components/ui/CopyField";
import { signOut } from "@/app/passport/actions";
import { updateItem, type FormState } from "./actions";

export function SessionButtons({ slug, compact = false }: { slug: string; compact?: boolean }) {
  return (
    <div className={`flex gap-4 font-plex text-xs ${compact ? "mt-1" : "mt-4"}`}>
      <a href={`/passport`} data-slug={slug} className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
        Your profile
      </a>
      <form action={signOut}>
        <button type="submit" className="text-lightgray underline decoration-hairline underline-offset-4 hover:text-lime">
          Sign out
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
