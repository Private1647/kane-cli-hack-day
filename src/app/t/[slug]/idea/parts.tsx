"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Label, SubmitButton, Toggle, inputCls } from "@/components/forms/fields";
import { RequestIntro } from "@/app/match/parts";
import { ActionNote, smallBtn } from "@/app/team/ui";
import type { RadarMatch } from "@/server/ideas";
import { radarAction, saveIdeaAction, selectIdeaAction, validateIdeaAction, type IdeaFormState, type RadarState, type ValidateState } from "./actions";

export function IdeaForm({
  slug,
  types,
  defaults,
  disabled,
}: {
  slug: string;
  types: { id: string; label: string }[];
  defaults: { title: string; private_description: string; public_summary: string; discovery_opt_in: boolean; project_type: string };
  disabled: boolean;
}) {
  const [state, action] = useActionState<IdeaFormState, FormData>(saveIdeaAction.bind(null, slug), null);
  const [share, setShare] = useState(defaults.discovery_opt_in);
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
        <div>
          <Label htmlFor="i-title">Working title</Label>
          <input id="i-title" name="title" required maxLength={120} defaultValue={defaults.title} className={inputCls} />
        </div>
        <div>
          <Label htmlFor="i-type">What you&apos;re making</Label>
          <select key={defaults.project_type} id="i-type" name="project_type" defaultValue={defaults.project_type} className={`${inputCls} min-h-11`}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-2 font-plex text-xs text-lightgray">A standalone validation harness, CI pipeline or plugin is fully eligible on its own.</p>
        </div>
        <div>
          <Label htmlFor="i-desc" hint="Private · your team and organizers only">
            The idea
          </Label>
          <textarea
            id="i-desc"
            name="private_description"
            maxLength={4000}
            rows={7}
            defaultValue={defaults.private_description}
            className={inputCls}
            placeholder="What you'll build with your coding agent, which flows Kane verifies, what happens when a run fails, and what you'll show as proof."
          />
        </div>
        <div className="border-y border-dashed border-hairline py-2">
          <Toggle
            name="discovery_opt_in"
            label="Share a public summary with other teams"
            checked={share}
            onChange={setShare}
            description="Only the summary below is shared, in the Idea Radar. Your private description never is."
          />
        </div>
        {share && (
          <div>
            <Label htmlFor="i-public" hint="Public to opted-in teams">
              Public summary
            </Label>
            <textarea id="i-public" name="public_summary" required maxLength={400} rows={3} defaultValue={defaults.public_summary} className={inputCls} placeholder="One or two sentences: problem, approach, audience." />
          </div>
        )}
        {!share && <input type="hidden" name="public_summary" value={defaults.public_summary} />}
      </fieldset>
      <ActionNote state={state} ok="Saved as a new revision." />
      {!disabled && (
        <SubmitButton pending="Saving…" className="min-h-11">
          Save idea
        </SubmitButton>
      )}
    </form>
  );
}

export function ValidateForm({ slug, disabled }: { slug: string; disabled: boolean }) {
  const [state, action] = useActionState<ValidateState, FormData>(validateIdeaAction.bind(null, slug), null);
  return (
    <form action={action} className="space-y-3">
      <Toggle
        name="use_ai"
        label="Use AI for this check"
        defaultChecked
        description="Sends your title and description to the AI model through the Vercel AI Gateway for this check only. Off = rule-based check, nothing leaves our server."
      />
      <ActionNote state={state} ok="Checked." />
      <SubmitButton pending="Checking…" className={`min-h-11 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        Validate idea
      </SubmitButton>
    </form>
  );
}

export function SelectIdeaButton({ slug }: { slug: string }) {
  const [state, setState] = useState<IdeaFormState>(null);
  return (
    <form action={async () => setState(await selectIdeaAction(slug))} className="space-y-2">
      <Pending className={smallBtn}>Lock in this idea</Pending>
      <ActionNote state={state} ok="Idea selected." />
    </form>
  );
}

function Pending({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Working…" : children}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
      Print
    </button>
  );
}

const LABEL: Record<RadarMatch["label"], string> = {
  possible_overlap: "Possible overlap",
  similar_angle: "Similar angle",
  complementary: "Complementary",
};

export function RadarRunner({ slug, canCollaborate }: { slug: string; canCollaborate: boolean }) {
  const [state, setState] = useState<RadarState>(null);
  const result = state?.ok ? state.data : null;
  return (
    <div className="space-y-6">
      <form action={async () => setState(await radarAction(slug))}>
        <Pending className="inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">Check for overlap →</Pending>
      </form>
      <ActionNote state={state && !state.ok ? state : null} />
      {result?.status === "needs_opt_in" && (
        <p className="border-l-2 border-warning pl-3 font-plex text-sm text-warning">
          Share a public summary first (on the{" "}
          <Link href={`/t/${slug}/idea`} className="underline underline-offset-4">
            idea tab
          </Link>
          ). The radar only compares summaries teams chose to share.
        </p>
      )}
      {result?.status === "ok" && (
        <div className="space-y-4">
          <p className="font-plex text-xs text-lightgray">
            Compared with {result.compared} shared {result.compared === 1 ? "summary" : "summaries"} · {result.method === "embeddings" ? "AI embeddings" : "word overlap"}
            {result.warning ? ` · ${result.warning}` : ""}
          </p>
          {result.matches.length === 0 ? (
            <p className="font-plex text-sm text-bright">Nothing close among shared ideas. That says nothing about ideas teams kept private.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {result.matches.map((m) => (
                <li key={m.team_id} className="flex flex-col gap-3 border border-hairline p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`border px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] ${m.label === "possible_overlap" ? "border-warning text-warning" : "border-hairline text-lightgray"}`}>{LABEL[m.label]}</span>
                    <span className="font-plex text-xs text-lightgray">{Math.round(m.similarity * 100)}% similar</span>
                  </div>
                  <p className="font-display text-lg text-bright">{m.team_name}</p>
                  <p className="font-plex text-sm text-lightgray">“{m.public_summary}”</p>
                  <p className="font-plex text-xs text-bright">{m.explanation}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Link href={`/t/${slug}/idea#idea-form`} className={smallBtn}>
                      Differentiate
                    </Link>
                    {canCollaborate && <RequestIntro target={{ team: m.team_id }} kind="collaborate" label="Request collaboration" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
