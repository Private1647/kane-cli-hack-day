import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/Section";
import { query } from "@/lib/db";
import { photoSrc } from "@/lib/photos";
import { getStaff, hasRole } from "@/server/auth";
import { AppError } from "@/server/core";
import { evaluateConsent, getPhoto } from "@/server/photos";
import { attestAction, candidateAction, consentAction, teamAction } from "../actions";
import { ConsentPill, MatchPill, PhotoStatusPill, StaffGate, label } from "../parts";
import { ActionForm, IdentifyPanel } from "./Tools";

export const metadata: Metadata = { title: "Photo · Identify", robots: { index: false } };

// One photo: who is in it (badge scan / lookup / confirmed suggestions), each
// person's consent, and the consent gate that lets it move on to captions.

export default function PhotoPage({ params }: PageProps<"/photo/[id]">) {
  return (
    <main className="container-page py-10 sm:py-14">
      <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
        <PhotoView params={params} />
      </Suspense>
    </main>
  );
}

async function PhotoView({ params }: Pick<PageProps<"/photo/[id]">, "params">) {
  const { id } = await params;
  const staff = await getStaff();
  if (!hasRole(staff, "photographer", "organizer")) return <StaffGate role="photographer" next={`/photo/${id}`} signedIn={!!staff} />;
  const photoId = Number(id);
  if (!Number.isInteger(photoId) || photoId <= 0) notFound();
  let data: Awaited<ReturnType<typeof getPhoto>>;
  try {
    data = await getPhoto(photoId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { photo, people } = data;
  const teams = await query<{ id: number; name: string }>("select id, name from teams order by name");
  const gate = evaluateConsent(people, !!photo.no_people_attested_at);
  const locked = photo.status === "published" || photo.status === "rejected";
  const teamOptions = (
    <select name="team_id" defaultValue={photo.team_id ?? ""} required aria-label="Team" className="min-h-11 w-full border border-hairline bg-surface px-3 font-plex text-sm text-bright">
      <option value="" disabled>
        Pick a team
      </option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/photo" className="inline-flex min-h-11 items-center font-plex text-xs text-lightgray hover:text-lime">
          ← Studio
        </Link>
        <Eyebrow className="mt-2">
          Photo #{photo.id} · {photo.source} · {photo.team_name ?? "no team yet"}
        </Eyebrow>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PhotoStatusPill status={photo.status} held={!!photo.hold_reason && photo.status === "identity_review"} />
          {photo.hold_reason && <p className="font-plex text-sm text-warning">{photo.hold_reason}</p>}
          {photo.rejected_reason && <p className="font-plex text-sm text-lightgray">Rejected: {photo.rejected_reason}</p>}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
          <img src={photoSrc(photo.pathname)!} alt={photo.alt_text ?? `Photo ${photo.id}, not yet described`} className="w-full border border-hairline bg-surface" />
          {photo.alt_text && <p className="font-plex text-xs text-lightgray">Alt text: {photo.alt_text}</p>}
        </div>

        <div className="space-y-8">
          <section aria-labelledby="people-h" className="space-y-3">
            <h2 id="people-h" className={label}>
              People in frame · {people.length}
            </h2>
            {people.length ? (
              <ul className="border-t border-dashed border-hairline">
                {people.map((p) => (
                  <li key={p.member_id} className="space-y-2 border-b border-dashed border-hairline py-3">
                    <p className="font-plex text-sm text-bright">
                      {p.name} <span className="text-xs text-lightgray">{p.public_code ?? ""} · {p.team_name ?? "no team"}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <MatchPill p={p} />
                      <ConsentPill p={p} />
                      {p.mention === true ? (
                        <span className="font-plex text-[11px] text-lightgray">may be named</span>
                      ) : (
                        <span className="font-plex text-[11px] text-lightgray">don&apos;t name or tag</span>
                      )}
                    </div>
                    {!locked && (
                      <div className="flex flex-wrap gap-2">
                        {!p.confirmed_at && (
                          <ActionForm action={candidateAction} hidden={{ photo_id: photo.id, member_id: p.member_id, decision: "confirm" }} submit="Yes, that's them" />
                        )}
                        <ActionForm action={candidateAction} hidden={{ photo_id: photo.id, member_id: p.member_id, decision: "remove" }} submit={p.confirmed_at ? "Remove" : "Not them"} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-plex text-sm text-lightgray">
                {photo.no_people_attested_at ? "Attested: nobody identifiable in frame." : "Nobody identified yet. Unknown identity means the photo is held."}
              </p>
            )}
          </section>

          {!locked && (
            <>
              <section aria-labelledby="id-h" className="space-y-3">
                <h2 id="id-h" className={label}>
                  Identify someone
                </h2>
                <IdentifyPanel photoId={photo.id} />
              </section>

              <section aria-labelledby="team-h" className="space-y-3">
                <h2 id="team-h" className={label}>
                  Team
                </h2>
                <ActionForm action={teamAction} hidden={{ photo_id: photo.id }} submit="Set team">
                  {teamOptions}
                </ActionForm>
                {!people.length && !photo.no_people_attested_at && (
                  <ActionForm action={attestAction} hidden={{ photo_id: photo.id }} submit="Nobody identifiable in frame">
                    <p className="font-plex text-xs text-lightgray">Only for photos with no recognisable person (backs of heads, a robot, a screen). You are attesting this.</p>
                  </ActionForm>
                )}
              </section>

              <section aria-labelledby="gate-h" className="space-y-3 border border-hairline p-4">
                <h2 id="gate-h" className={label}>
                  Consent gate
                </h2>
                {gate.ok ? (
                  <p className="font-plex text-sm text-bright">Everyone is confirmed and has photo consent on record.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 font-plex text-xs text-warning">
                    {gate.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <ActionForm action={consentAction} hidden={{ photo_id: photo.id }} submit="Run consent check" primary />
              </section>
            </>
          )}

          <Link
            href={`/photo/${photo.id}/drafts`}
            className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
          >
            Captions &amp; social drafts →
          </Link>
        </div>
      </div>
    </div>
  );
}
