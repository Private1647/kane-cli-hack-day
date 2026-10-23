import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inputCls } from "@/components/forms/fields";
import CopyField from "@/components/ui/CopyField";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import PageHeader from "@/components/ui/PageHeader";
import { getFlags } from "@/lib/flags";
import { photoSrc } from "@/lib/photos";
import { getStaff, hasRole } from "@/server/auth";
import { serverNow } from "@/server/core";
import { STATUS_LABEL, listPhotos, photoCounts, reconcilePhotoConsent, type PhotoRow, type PhotoStatus } from "@/server/photos";
import { STYLE_LABEL, allOk, listDrafts, xConfigured, type DraftRow } from "@/server/social";
import { ChecksList, PhotoStatusPill } from "@/app/photo/parts";
import { ActionForm } from "@/app/photo/[id]/Tools";
import { AdminLogin } from "../parts";
import {
  approveDraftAction,
  approvePhotoAction,
  holdPhotoAction,
  manualPostAction,
  publishDraftAction,
  publishPhotoAction,
  rejectDraftAction,
  rejectPhotoAction,
} from "./actions";

export const metadata: Metadata = { title: "Media", robots: { index: false } };

// T-PHOTO-04/05: the media approval queue. Photos move through the state
// machine captured → identity_review → consent_checked → caption_drafted →
// approved → published (or rejected); social posts need their own approval.
// Opening this page sweeps for withdrawn consent and holds affected photos.

export default function MediaPage() {
  return (
    <main>
      <PageHeader eyebrow="Ops · Media" dim="Nothing goes public," bright="Without consent." />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <MediaView />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

const label = "mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray";
const QUEUE: PhotoStatus[] = ["identity_review", "captured", "consent_checked", "caption_drafted", "approved"];

async function MediaView() {
  const staff = await getStaff();
  if (!hasRole(staff, "organizer", "photographer")) return staff ? <p className="font-plex text-sm text-lightgray">Organizers and photographers only.</p> : <AdminLogin next="/ops/media" />;
  const organizer = hasRole(staff, "organizer");

  const held = await reconcilePhotoConsent();
  const [counts, queue, recent, drafts, flags, now] = await Promise.all([
    photoCounts(),
    listPhotos({ statuses: QUEUE, limit: 120 }),
    listPhotos({ statuses: ["published", "rejected"], limit: 24 }),
    listDrafts({ statuses: ["draft", "approved", "published"] }),
    getFlags(),
    serverNow(),
  ]);
  const xReady = flags.social_publish && xConfigured();

  return (
    <div className="space-y-14">
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(STATUS_LABEL) as PhotoStatus[]).map((s) => (
            <div key={s} className="bg-ink p-3">
              <dt className="font-plex text-[11px] text-lightgray">{STATUS_LABEL[s]}</dt>
              <dd className="mt-1 font-dots text-3xl leading-none font-black text-bright">{counts[s]}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-3 font-plex text-xs text-lightgray">
          <FreshnessStamp asOf={now} now={now} source="event_photos" />
          {held > 0 && <span className="text-warning">Held {held} photo{held === 1 ? "" : "s"} after a consent change.</span>}
          <Link href="/photo" className="inline-flex min-h-11 items-center underline decoration-hairline underline-offset-4 hover:text-lime">
            Photo studio →
          </Link>
        </div>
        {!flags.photo_studio && (
          <DegradedServiceAlert state="degraded" system="Photo studio">
            In-app uploads are off. The local pipeline import still works and is consent-gated.
          </DegradedServiceAlert>
        )}
      </div>

      <section aria-labelledby="queue-h">
        <h2 id="queue-h" className={label}>
          Review queue · {queue.length}
        </h2>
        {queue.length ? (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((p) => (
              <PhotoCard key={p.id} p={p} organizer={organizer} />
            ))}
          </ul>
        ) : (
          <p className="font-plex text-sm text-lightgray">Nothing waiting.</p>
        )}
      </section>

      <section id="social" aria-labelledby="social-h" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="social-h" className={label}>
            Social posts · {drafts.length}
          </h2>
          {organizer && (
            <a href="/api/v1/social/export" className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
              Buffer CSV (approved)
            </a>
          )}
        </div>
        {!xReady && (
          <DegradedServiceAlert state="degraded" system="X publishing">
            {flags.social_publish ? "X API keys aren't configured." : "Switched off (flag social_publish)."} Approved posts can be copied, the photo downloaded, and posted by hand or via the Buffer CSV.
          </DegradedServiceAlert>
        )}
        {drafts.length ? (
          <ul className="space-y-4">
            {drafts.map((d) => (
              <DraftCard key={d.id} d={d} organizer={organizer} xReady={xReady} />
            ))}
          </ul>
        ) : (
          <p className="font-plex text-sm text-lightgray">No drafts. Photographers draft captions from each consent-checked photo.</p>
        )}
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className={label}>
          Recently published or rejected
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recent.map((p) => (
            <PhotoCard key={p.id} p={p} organizer={organizer} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PhotoCard({ p, organizer }: { p: PhotoRow; organizer: boolean }) {
  return (
    <li className="space-y-3 border border-hairline bg-surface p-3">
      <Link href={`/photo/${p.id}`} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
        <img src={photoSrc(p.pathname)!} alt={p.alt_text ?? `Photo ${p.id}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <PhotoStatusPill status={p.status} held={!!p.hold_reason && p.status === "identity_review"} />
        <span className="font-plex text-xs text-lightgray">
          #{p.id} · {p.team_name ?? "no team"} · {p.people_count} people · {p.source}
          {p.photographer_name ? ` · ${p.photographer_name}` : ""}
        </span>
      </div>
      {p.hold_reason && <p className="font-plex text-xs text-warning">{p.hold_reason}</p>}
      {p.rejected_reason && <p className="font-plex text-xs text-lightgray">Rejected: {p.rejected_reason}</p>}
      <div className="flex flex-wrap gap-2">
        {organizer && (p.status === "consent_checked" || p.status === "caption_drafted") && (
          <ActionForm action={approvePhotoAction} hidden={{ photo_id: p.id }} submit="Approve" primary>
            <textarea name="alt_text" rows={2} maxLength={500} defaultValue={p.alt_text ?? ""} placeholder="Alt text (required)" aria-label="Alt text" className={inputCls} />
          </ActionForm>
        )}
        {organizer && p.status === "approved" && <ActionForm action={publishPhotoAction} hidden={{ photo_id: p.id }} submit="Publish to gallery" primary />}
        {(p.status === "approved" || p.status === "published") && (
          <a href={`/api/v1/media/${p.id}/download`} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            Download
          </a>
        )}
        {["consent_checked", "caption_drafted", "approved", "published"].includes(p.status) && (
          <ActionForm action={holdPhotoAction} hidden={{ photo_id: p.id }} submit={p.status === "published" ? "Unpublish & hold" : "Hold"} />
        )}
        {p.status !== "rejected" && (
          <ActionForm action={rejectPhotoAction} hidden={{ photo_id: p.id }} submit="Reject">
            <input name="reason" required maxLength={300} placeholder="Reason" aria-label="Reject reason" className={`${inputCls} min-h-11`} />
          </ActionForm>
        )}
      </div>
    </li>
  );
}

function DraftCard({ d, organizer, xReady }: { d: DraftRow; organizer: boolean; xReady: boolean }) {
  const ok = allOk(d.checks);
  return (
    <li id={`draft-${d.id}`} className="grid gap-4 border border-hairline bg-surface p-4 md:grid-cols-[160px_minmax(0,1fr)]">
      {d.pathname ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route
        <img src={photoSrc(d.pathname)!} alt={d.alt_text ?? "Photo for this post"} loading="lazy" className="aspect-[4/3] w-full object-cover md:w-40" />
      ) : (
        <span />
      )}
      <div className="min-w-0 space-y-3">
        <p className="font-plex text-xs text-lightgray">
          <span className="text-bright">{STYLE_LABEL[d.style]}</span> · #{d.id} · {d.team_name ?? "no team"} · {d.status}
          {d.photo_status && ` · photo ${d.photo_status}`} · {d.generated_by === "llm" ? "advisory AI draft" : d.generated_by === "template" ? "rule-based draft" : "edited by staff"}
          {d.approved_by_name && ` · approved by ${d.approved_by_name}`}
        </p>
        <CopyField value={d.proposed_text} />
        {d.alt_text && <p className="font-plex text-xs text-lightgray">Alt: {d.alt_text}</p>}
        <ChecksList checks={d.checks} />
        {d.post_url && (
          <a href={d.post_url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
            View post ↗
          </a>
        )}
        {organizer && d.status === "draft" && (
          <div className="flex flex-wrap gap-2">
            <ActionForm action={approveDraftAction} hidden={{ draft_id: d.id }} submit={ok ? "Approve post" : "Approve (re-runs checks)"} primary={ok} />
            <ActionForm action={rejectDraftAction} hidden={{ draft_id: d.id }} submit="Reject" />
          </div>
        )}
        {organizer && d.status === "approved" && (
          <div className="flex flex-wrap items-start gap-2">
            {xReady && (
              <ActionForm action={publishDraftAction} hidden={{ draft_id: d.id, key: `ui-publish-${d.id}` }} submit="Post to X" primary>
                <label className="flex min-h-11 items-center gap-2 font-plex text-xs text-bright">
                  <input type="checkbox" name="explicit_confirmation" required className="h-4 w-4 accent-[var(--lime)]" />I reviewed this post and its photo.
                </label>
              </ActionForm>
            )}
            <ActionForm action={manualPostAction} hidden={{ draft_id: d.id }} submit="Mark posted by hand">
              <input name="url" type="url" placeholder="https://x.com/… (optional)" aria-label="Post URL" className={`${inputCls} min-h-11`} />
            </ActionForm>
            <ActionForm action={rejectDraftAction} hidden={{ draft_id: d.id }} submit="Reject" />
          </div>
        )}
      </div>
    </li>
  );
}
