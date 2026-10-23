import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { inputCls } from "@/components/forms/fields";
import CopyField from "@/components/ui/CopyField";
import { photoSrc } from "@/lib/photos";
import { getStaff, hasRole } from "@/server/auth";
import { AppError } from "@/server/core";
import { getPhoto } from "@/server/photos";
import { STYLE_LABEL, listDrafts } from "@/server/social";
import { draftAction, editDraftAction } from "../../actions";
import { ChecksList, PhotoStatusPill, StaffGate, label } from "../../parts";
import { ActionForm } from "../Tools";

export const metadata: Metadata = { title: "Photo · Drafts", robots: { index: false } };

// T-PHOTO-03: three caption styles + alt text for a consent-checked photo,
// backed only by the team's latest verified public milestone. AI drafts are
// advisory; templates take over when the gateway is down. Every draft shows
// its checks; an organizer approves in /ops/media.

export default function DraftsPage({ params }: PageProps<"/photo/[id]/drafts">) {
  return (
    <main className="container-page py-10 sm:py-14">
      <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
        <DraftsView params={params} />
      </Suspense>
    </main>
  );
}

async function DraftsView({ params }: Pick<PageProps<"/photo/[id]/drafts">, "params">) {
  const { id } = await params;
  const staff = await getStaff();
  if (!hasRole(staff, "photographer", "organizer")) return <StaffGate role="photographer" next={`/photo/${id}/drafts`} signedIn={!!staff} />;
  const photoId = Number(id);
  if (!Number.isInteger(photoId) || photoId <= 0) notFound();
  let photo;
  try {
    photo = (await getPhoto(photoId)).photo;
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const drafts = await listDrafts({ photoId });
  const canDraft = ["consent_checked", "caption_drafted", "approved", "published"].includes(photo.status);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/photo/${photo.id}`} className="inline-flex min-h-11 items-center font-plex text-xs text-lightgray hover:text-lime">
          ← Photo #{photo.id}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold text-bright">Captions</h1>
          <PhotoStatusPill status={photo.status} held={!!photo.hold_reason && photo.status === "identity_review"} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
          <img src={photoSrc(photo.pathname)!} alt={photo.alt_text ?? `Photo ${photo.id}`} className="w-full border border-hairline" />
          {canDraft ? (
            <ActionForm action={draftAction} hidden={{ photo_id: photo.id }} submit={drafts.length ? "Draft 3 more" : "Draft 3 captions"} primary>
              <p className="font-plex text-xs text-lightgray">Uses the team&apos;s latest verified public milestone only. Names only people who agreed to be mentioned.</p>
            </ActionForm>
          ) : (
            <p className="border-l-2 border-warning bg-warning-deep px-3 py-2 font-plex text-sm text-bright">Run the consent check on the photo first. Captions wait until everyone in it is confirmed and consented.</p>
          )}
        </div>

        <section aria-labelledby="drafts-h" className="space-y-4">
          <h2 id="drafts-h" className={label}>
            Drafts · {drafts.length}
          </h2>
          {drafts.length === 0 && <p className="font-plex text-sm text-lightgray">No drafts yet.</p>}
          {drafts.map((d) => (
            <article key={d.id} id={`draft-${d.id}`} className="space-y-3 border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 font-plex text-xs text-lightgray">
                <span className="text-bright">{STYLE_LABEL[d.style]}</span>
                <span>#{d.id}</span>
                <span>· {d.status}</span>
                <span>· {d.generated_by === "llm" ? "Advisory AI draft" : d.generated_by === "template" ? "Rule-based draft" : "Edited by staff"}</span>
              </div>
              {d.status === "draft" ? (
                <ActionForm action={editDraftAction} hidden={{ draft_id: d.id }} submit="Save edit & re-check">
                  <textarea name="text" rows={3} maxLength={1000} defaultValue={d.proposed_text} aria-label={`Text of draft ${d.id}`} className={inputCls} />
                  <textarea name="alt_text" rows={2} maxLength={500} defaultValue={d.alt_text ?? ""} aria-label={`Alt text of draft ${d.id}`} className={inputCls} />
                </ActionForm>
              ) : (
                <>
                  <CopyField value={d.proposed_text} />
                  {d.alt_text && <p className="font-plex text-xs text-lightgray">Alt: {d.alt_text}</p>}
                </>
              )}
              <ChecksList checks={d.checks} />
            </article>
          ))}
          {drafts.length > 0 && (
            <Link href="/ops/media#social" className="inline-flex min-h-11 items-center font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
              Organizer approval in the media queue →
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
