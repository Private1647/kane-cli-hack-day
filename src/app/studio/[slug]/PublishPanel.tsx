"use client";

import { useActionState, useState } from "react";
import { ConfirmByTyping } from "@/components/forms/fields";
import { publishShowcaseAction, type PublishState } from "./actions";
import { ResultLine, newKey } from "./fields";

// Publish an approved story version (T-SHIP-05): the team member types the
// slug, the server re-runs the review and the consent check, and writes an
// immutable published version with a consent receipt.

export default function PublishPanel({
  slug,
  version,
  blockers,
  consentMissing,
  credited,
  publishedVersion,
}: {
  slug: string;
  version: number;
  blockers: string[];
  consentMissing: string[];
  credited: string[];
  publishedVersion: number | null;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(publishShowcaseAction, null);
  const [key] = useState(newKey);
  const blocked = version === 0 || blockers.length > 0 || consentMissing.length > 0;

  return (
    <div className="space-y-5">
      {version === 0 && <p className="font-plex text-sm text-lightgray">Save your story first.</p>}
      {(blockers.length > 0 || consentMissing.length > 0) && (
        <div className="border-l-2 border-warning bg-warning-deep px-4 py-3">
          <p className="font-pixel text-[10px] tracking-[0.2em] text-warning uppercase">! Before you can publish v{version}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-plex text-sm text-bright">
            {[...blockers, ...consentMissing].map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="font-plex text-sm text-lightgray">
        <p>
          Credited by name: <span className="text-bright">{credited.length ? credited.join(", ") : "nobody (the page won't list names)"}</span>
        </p>
        {publishedVersion !== null && <p className="mt-1">Public now: published version {publishedVersion}. Publishing again adds a new version; earlier ones stay on record.</p>}
      </div>
      <form action={action} className="max-w-md space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="story_version" value={version} />
        <input type="hidden" name="idempotency_key" value={`${key}-v${version}`} />
        <ConfirmByTyping phrase={slug}>
          {(matched) => (
            <button
              type="submit"
              disabled={!matched || blocked || pending}
              className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Publishing…" : `Approve and publish story v${version}`}
            </button>
          )}
        </ConfirmByTyping>
      </form>
      {state && (state.ok ? <ResultLine ok message={`Published as version ${state.data.version}. It's live (public) at /ship/${slug}.`} receipt={state.receipt?.id} /> : <ResultLine ok={false} message={state.error.message} />)}
    </div>
  );
}
