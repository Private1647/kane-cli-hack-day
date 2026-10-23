"use client";

import { useState, useTransition } from "react";
import { setTemplateAction } from "../actions";
import { ResultLine } from "../fields";

// "Use this template" for the template picker. The choice is a display
// setting only; the story, claims and consents don't change.

export default function UseTemplate({ slug, template, current, name }: { slug: string; template: string; current: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string; receipt?: string } | null>(null);
  if (current) return <p className="font-plex text-sm text-lightgray">{name} is your current template.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setTemplateAction(slug, template);
            setMsg(r.ok ? { ok: true, message: `Ship Page now uses ${name}.`, receipt: r.receipt?.id } : { ok: false, message: r.error.message });
          })
        }
        className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:opacity-60"
      >
        {pending ? "Switching…" : `Use ${name}`}
      </button>
      {msg && <ResultLine {...msg} />}
    </div>
  );
}
