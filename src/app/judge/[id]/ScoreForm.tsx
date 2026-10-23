"use client";

import { startTransition, useActionState, useId, useRef, useState, type FormEvent } from "react";
import { FormError, Label, inputCls } from "@/components/forms/fields";
import { judging } from "@/data/hackday";
import { scoreAction, type ScoreState } from "../actions";

// The rubric form: one 0–5 anchor per category (points = anchor × weight / 5),
// an evidence note per category, overall comments and an uncertainty note.
// The mid round is feedback only, so it has no anchors. Nothing here is
// pre-filled by AI; the only defaults are this judge's own saved draft.

type Saved = { anchors: Record<string, number | null>; evidence: Record<string, string | null>; comments: string | null; uncertainty: string | null };

const pts = (anchor: number, weight: number) => Math.round(((anchor * weight) / 5) * 100) / 100;

export default function ScoreForm({ submissionId, round, scored, saved }: { submissionId: number; round: string; scored: boolean; saved: Saved | null }) {
  const [state, action, pending] = useActionState<ScoreState, FormData>(scoreAction, null);
  const [anchors, setAnchors] = useState<Record<string, number | null>>(() => saved?.anchors ?? {});
  const base = useId();
  // Idempotency key: random per mount, bumped after every response. Set at
  // submit time (not render) so server and client HTML match.
  const mount = useRef<string | null>(null);
  // Submitting by hand (not via the action prop) keeps typed text if the
  // server refuses the score; React would otherwise reset the form.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mount.current ??= crypto.randomUUID();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    fd.set("form_key", `${mount.current}-${state?.seq ?? 0}`);
    startTransition(() => action(fd));
  };
  const issue = (path: string) => state?.issues?.find((i) => i.path === path)?.message;

  const complete = judging.rubric.every((r) => typeof anchors[r.key] === "number");
  const total = judging.rubric.reduce((n, r) => n + (typeof anchors[r.key] === "number" ? pts(anchors[r.key]!, r.points) : 0), 0);

  return (
    <form onSubmit={submit} className="space-y-6">
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="round" value={round} />

      {scored &&
        judging.rubric.map((r) => {
          const a = anchors[r.key];
          return (
            <fieldset key={r.key} className="border border-hairline p-4" aria-describedby={`${base}-${r.key}-d`}>
              <legend className="px-1 font-display text-base text-bright">
                {r.name} <span className="font-plex text-xs text-lightgray">· {r.points} pts</span>
              </legend>
              <p id={`${base}-${r.key}-d`} className="font-plex text-xs leading-relaxed text-lightgray">
                {r.inspect}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {judging.anchors.map((x) => (
                  <label
                    key={x.score}
                    className={`flex min-h-11 cursor-pointer flex-col items-center justify-center border px-1 py-1.5 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${
                      a === x.score ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lightgray"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`anchor_${r.key}`}
                      value={x.score}
                      checked={a === x.score}
                      onChange={() => setAnchors((p) => ({ ...p, [r.key]: x.score }))}
                      className="sr-only"
                    />
                    <span className="font-dots text-xl leading-none font-black">{x.score}</span>
                    <span className="font-plex text-[10px]">{x.label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 font-plex text-xs text-lightgray" aria-live="polite">
                {typeof a === "number" ? `${pts(a, r.points)} of ${r.points} points` : "No anchor yet"}
              </p>
              {issue(`anchors.${r.key}`) && <p className="mt-1 font-plex text-xs text-danger">{issue(`anchors.${r.key}`)}</p>}
              <div className="mt-3">
                <Label htmlFor={`${base}-${r.key}-ev`} hint="run id, evidence id, what you saw">
                  Evidence
                </Label>
                <textarea
                  id={`${base}-${r.key}-ev`}
                  name={`evidence_${r.key}`}
                  rows={2}
                  maxLength={1000}
                  defaultValue={saved?.evidence[r.key] ?? ""}
                  className={inputCls}
                />
              </div>
            </fieldset>
          );
        })}

      {scored && (
        <div className="flex items-end justify-between border-y border-dashed border-hairline py-4">
          <p className={`font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray`}>{complete ? "Total" : "Running total · incomplete"}</p>
          <p className="font-dots text-5xl leading-none font-black text-bright" aria-live="polite">
            {Math.round(total * 100) / 100}
            <span className="font-plex text-sm font-normal text-lightgray"> / 100</span>
          </p>
        </div>
      )}

      <div>
        <Label htmlFor={`${base}-comments`} hint={scored ? "optional" : "required to commit"}>
          {scored ? "Comments" : "Feedback for the team"}
        </Label>
        <textarea id={`${base}-comments`} name="comments" rows={4} maxLength={4000} defaultValue={saved?.comments ?? ""} className={inputCls} />
        {issue("comments") && <p className="mt-1 font-plex text-xs text-danger">{issue("comments")}</p>}
      </div>

      {scored && (
        <div>
          <Label htmlFor={`${base}-unc`} hint="required if any category has no evidence">
            What you couldn&apos;t verify
          </Label>
          <textarea id={`${base}-unc`} name="uncertainty" rows={3} maxLength={2000} defaultValue={saved?.uncertainty ?? ""} className={inputCls} />
          {issue("uncertainty") && <p className="mt-1 font-plex text-xs text-danger">{issue("uncertainty")}</p>}
        </div>
      )}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 font-plex text-sm text-bright">
        <input type="checkbox" name="confirm_commit" className="mt-1 h-4 w-4 accent-[var(--lime)]" />
        <span>I&apos;m ready to commit. A committed score is frozen and can&apos;t be changed.</span>
      </label>

      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="font-plex text-sm text-bright">
          {state.ok} {state.receipt && <span className="text-lightgray">Receipt {state.receipt.id} · {new Date(state.receipt.server_time).toLocaleTimeString()}</span>}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
        >
          {pending ? "Working…" : "Save draft"}
        </button>
        <button
          type="submit"
          name="intent"
          value="commit"
          disabled={pending}
          className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:opacity-60"
        >
          {pending ? "Working…" : "Commit score"}
        </button>
      </div>
    </form>
  );
}
