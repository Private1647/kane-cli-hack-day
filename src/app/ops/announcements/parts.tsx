"use client";

import { useState } from "react";
import { Label, inputCls } from "@/components/forms/fields";
import type { AnnouncementTemplate } from "@/server/ops";
import ActionForm, { ReasonField, SelectField } from "../_kit/ActionForm";
import { publishAction, retractAction } from "./actions";

// Compose with a preapproved template (fallback/09) or from scratch. The
// server refuses anything still holding a [placeholder].

export function Composer({ templates, visibility }: { templates: AnnouncementTemplate[]; visibility: Record<string, string> }) {
  const [template, setTemplate] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const pick = (id: string) => {
    const t = templates.find((x) => x.id === id);
    setTemplate(id);
    if (t) {
      setTitle(t.title);
      setBody(t.body);
      setHref(t.href ?? "");
    }
  };
  const placeholder = /\[[^\]]+\]/.test(title + body);
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Preapproved templates</p>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              aria-pressed={template === t.id}
              className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs transition-colors ${template === t.id ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ActionForm action={publishAction} submit="Publish announcement →" pending="Publishing…" confirm="Publish this announcement now?">
        <input type="hidden" name="template" value={template} />
        <div>
          <Label htmlFor="an-title" hint={`${title.length}/100`}>
            Title
          </Label>
          <input id="an-title" name="title" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} min-h-11`} />
        </div>
        <div>
          <Label htmlFor="an-body" hint={`${body.length}/600`}>
            Body
          </Label>
          <textarea id="an-body" name="body" rows={4} maxLength={600} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls} />
        </div>
        {placeholder && (
          <p role="status" className="border-l-2 border-warning pl-3 font-plex text-sm text-warning">
            ! Replace the [placeholders] before publishing. Don&apos;t announce availability you haven&apos;t verified.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="an-href" hint="optional">
              Link
            </Label>
            <input id="an-href" name="href" maxLength={500} value={href} onChange={(e) => setHref(e.target.value)} placeholder="/live or https://…" className={`${inputCls} min-h-11`} />
          </div>
          <SelectField id="an-vis" name="visibility" label="Where" defaultValue="both" options={Object.entries(visibility).map(([value, label]) => ({ value, label }))} />
          <SelectField
            id="an-delay"
            name="delay"
            label="When"
            defaultValue="0"
            options={[
              { value: "0", label: "Now" },
              { value: "5", label: "In 5 minutes" },
              { value: "15", label: "In 15 minutes" },
              { value: "30", label: "In 30 minutes" },
              { value: "60", label: "In 1 hour" },
            ]}
          />
        </div>
      </ActionForm>
    </div>
  );
}

export function Retract({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center px-2 font-plex text-xs text-lightgray hover:text-danger">
        Take down…
      </button>
    );
  }
  return (
    <ActionForm action={retractAction} submit="Take down" pending="Removing…" variant="danger" className="w-full max-w-sm">
      <input type="hidden" name="id" value={id} />
      <ReasonField id={`rt-${id}`} placeholder="e.g. wrong time, superseded" />
    </ActionForm>
  );
}
