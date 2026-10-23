import type { Metadata } from "next";
import Link from "next/link";
import { event } from "@/data/hackday";
import { getEventPhotos, getMemberProfiles, getTeamPhotoInfo, photoSrc } from "@/lib/photos";
import type { Team } from "@/lib/teams";
import Hub, { type HubContext } from "../hub";
import { ConsentChoice, ProfileForm, SelfieEditor, TeamPhotoEditor } from "./parts";

export const metadata: Metadata = { title: "Photos" };

// The team's gallery of event photos, public to anyone with the link. Signed-in
// members also manage the team photo, their selfie, handles and consent here.

export default function PhotosTab({ params }: PageProps<"/t/[slug]/photos">) {
  return (
    <Hub params={params} tab="photos" publicView={(team) => <Gallery team={team} />}>
      {(ctx) => <MemberView {...ctx} />}
    </Hub>
  );
}

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

async function Gallery({ team, signedIn = false }: { team: Pick<Team, "id" | "slug" | "name">; signedIn?: boolean }) {
  const photos = await getEventPhotos(team.id);
  return (
    <section className="py-12 sm:py-16">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-hairline pb-4">
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">From the day</p>
            <p className="mt-2 font-dots text-5xl leading-none font-black text-bright">{photos.length}</p>
          </div>
          {!signedIn && (
            <Link href={`/t/${team.slug}`} className="font-plex text-xs text-lightgray underline decoration-hairline underline-offset-4 hover:text-lime">
              On this team? Sign in →
            </Link>
          )}
        </div>
        {photos.length ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => {
              const src = photoSrc(p.pathname)!;
              return (
                <li key={p.id} className="group relative">
                  <a href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden border border-hairline bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private photo proxy */}
                    <img src={src} alt={p.caption ?? `${team.name} at ${event.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </a>
                  <div className="mt-1.5 flex items-center justify-between gap-2 font-plex text-[11px] text-lightgray">
                    <span className="truncate">{p.caption ?? clock.format(p.created_at)}</span>
                    <a href={src} download={`${team.slug}-${p.id}.jpg`} className="shrink-0 hover:text-lime">
                      Download
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 max-w-xl font-plex text-sm text-lightgray">
            No photos yet. Photographers are shooting all day; shots of {team.name} land here within a couple of minutes, and you get a notification.
          </p>
        )}
      </div>
    </section>
  );
}

async function MemberView({ team, me }: HubContext) {
  const [info, profiles] = await Promise.all([getTeamPhotoInfo(team.id), getMemberProfiles(team.id)]);
  const mine = profiles.find((p) => p.id === me?.id);
  return (
    <>
      <Gallery team={team} signedIn />
      <section className="border-t border-dashed border-hairline py-12 sm:py-16">
        <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="space-y-8">
            <div>
              <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{team.is_solo ? "Your photo" : "Team photo"}</p>
              <p className="mb-4 font-plex text-xs text-lightgray">
                One clear photo{team.is_solo ? " of you" : " of everyone together"}, faces visible. It&apos;s how we find your shots in the photographers&apos; uploads
                {team.is_solo ? "" : ", once everyone on the team has said yes to photos"}.
              </p>
              {me ? (
                <TeamPhotoEditor slug={team.slug} pathname={info.photo_url} solo={team.is_solo} />
              ) : info.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- private photo proxy
                <img src={photoSrc(info.photo_url)!} alt={`${team.name} team photo`} className="w-full max-w-md border border-hairline" />
              ) : (
                <p className="font-plex text-sm text-lightgray">No team photo yet.</p>
              )}
            </div>
            {me && mine && <ConsentChoice slug={team.slug} consent={mine.consent_social} solo={team.is_solo} />}
          </div>

          <aside className="space-y-8">
            {me && mine && (
              <div className="space-y-6">
                <div>
                  <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Your selfie · optional</p>
                  <p className="mb-4 font-plex text-xs text-lightgray">So posts can name and tag you.</p>
                  <SelfieEditor slug={team.slug} pathname={mine.photo_url} />
                </div>
                <div>
                  <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Your handles</p>
                  <ProfileForm slug={team.slug} linkedin={mine.linkedin} x={mine.x_handle} />
                </div>
              </div>
            )}
            {!team.is_solo && (
              <div>
                <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Team</p>
                <ul className="border-t border-dashed border-hairline">
                  {profiles.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 border-b border-dashed border-hairline py-2.5 font-plex text-sm">
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private photo proxy
                        <img src={photoSrc(p.photo_url)!} alt="" className="h-8 w-8 object-cover" />
                      ) : (
                        <span aria-hidden className="grid h-8 w-8 place-items-center border border-dashed border-hairline text-xs text-lightgray">
                          {p.name[0]}
                        </span>
                      )}
                      <span className={p.id === me?.id ? "text-lime" : "text-bright"}>{p.name}</span>
                      <span
                        title="Their own answer to photos and posts"
                        className={`text-[11px] ${p.consent_social ? "text-lime" : p.consent_social === false ? "text-red-300" : "text-lightgray"}`}
                      >
                        {p.consent_social ? "yes to photos" : p.consent_social === false ? "no photos" : "not answered"}
                      </span>
                      <span className="ml-auto flex gap-3 text-xs text-lightgray">
                        {p.linkedin && (
                          <a href={p.linkedin} target="_blank" rel="noreferrer" className="hover:text-lime">
                            LinkedIn
                          </a>
                        )}
                        {p.x_handle && (
                          <a href={`https://x.com/${p.x_handle}`} target="_blank" rel="noreferrer" className="hover:text-lime">
                            @{p.x_handle}
                          </a>
                        )}
                        {!p.photo_url && !p.linkedin && !p.x_handle && <span>no selfie or handles</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
