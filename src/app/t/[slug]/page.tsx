import type { Metadata } from "next";
import { event } from "@/data/hackday";
import { getMemberProfiles } from "@/lib/photos";
import { PROGRESS_ITEMS, shippedMinimum } from "@/lib/progress";
import { MAX_MEMBERS, getActivity, getProgress } from "@/lib/teams";
import { to12h } from "@/lib/time";
import Hub, { type HubContext } from "./hub";
import Link from "next/link";
import { AutoRefresh, CopyLink, ProgressRow, SessionButtons } from "./parts";
import { ConsentChoice } from "./photos/parts";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage({ params, searchParams }: PageProps<"/t/[slug]">) {
  return (
    <Hub params={params} searchParams={searchParams} tab="">
      {(ctx) => <Dashboard {...ctx} />}
    </Hub>
  );
}

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

async function Dashboard({ team, members, me }: HubContext) {
  const slug = team.slug;
  const [progress, activity, profiles] = await Promise.all([getProgress(team.id), getActivity(team.id), getMemberProfiles(team.id)]);
  const unanswered = me ? profiles.find((p) => p.id === me.id)?.consent_social === null : false;
  const byItem = new Map(progress.map((p) => [p.item, p]));
  const done = new Set(progress.filter((p) => p.done).map((p) => p.item));
  const shipped = shippedMinimum(done);

  return (
    <>
      <AutoRefresh seconds={20} />
      {unanswered && (
        <div className="container-page pt-10">
          <ConsentChoice slug={slug} consent={null} solo={team.is_solo} prompt />
        </div>
      )}
      <section className="py-12 sm:py-16">
        <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          {/* Left: the checklist */}
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-hairline pb-4">
              <div>
                <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Progress</p>
                <p className="mt-2 font-dots text-5xl leading-none font-black text-bright">
                  {done.size}
                  <span className="text-lightgray">/{PROGRESS_ITEMS.length}</span>
                </p>
              </div>
              <span
                className={`border px-2 py-1 font-pixel text-[10px] uppercase tracking-[0.2em] ${
                  shipped ? "border-lime text-lime" : "border-hairline text-lightgray"
                }`}
              >
                {shipped ? "Shipped minimum met" : "Shipped minimum: 3 essentials + 2 content"}
              </span>
            </div>
            {(["idea", "essential", "content"] as const).map((kind) => (
              <div key={kind} className="mt-8">
                <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                  {kind === "idea" ? "Idea" : kind === "essential" ? "Essentials" : "Content · pick two or more"}
                </p>
                <ul className="border-t border-dashed border-hairline">
                  {PROGRESS_ITEMS.filter((i) => i.kind === kind).map((item) => {
                    const row = byItem.get(item.id);
                    return (
                      <ProgressRow
                        key={`${item.id}:${row?.updated_at?.toISOString() ?? ""}`}
                        slug={slug}
                        item={{ id: item.id, label: item.label, placeholder: item.placeholder }}
                        deadline={to12h(item.deadline)}
                        value={row?.value ?? ""}
                        done={row?.done ?? false}
                        by={row?.updated_by_name ? `${row.updated_by_name} · ${clock.format(row.updated_at)}` : null}
                        readOnly={!me}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Right: who you are, the roster, and what's been happening */}
          <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
            {me ? (
              <div className="brackets border border-lime bg-lime-deep p-5">
                <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Signed in as</p>
                <p className="mt-2 font-display text-2xl text-bright">{me.name}</p>
                <p className="mt-1 font-plex text-xs text-lightgray">
                  {me.email} · {team.name}
                </p>
                <SessionButtons slug={slug} />
              </div>
            ) : (
              <div className="border border-lime p-5 font-plex text-sm text-lightgray">
                <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Viewing as admin</p>
                <p className="mt-2">Read-only. Members sign in as themselves to make changes.</p>
              </div>
            )}

            <div>
              <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                {team.is_solo ? "Solo" : `Team · ${members.length}/${MAX_MEMBERS}`}
              </p>
              <ul className="border-t border-dashed border-hairline">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-b border-dashed border-hairline py-2.5 font-plex text-sm">
                    <span aria-hidden className={`h-2 w-2 ${m.id === me?.id ? "bg-lime" : "bg-hairline"}`} />
                    <span className={m.id === me?.id ? "text-lime" : "text-bright"}>{m.name}</span>
                    {m.id === me?.id && <span className="text-xs text-lightgray">you</span>}
                  </li>
                ))}
              </ul>
              {me && members.length < MAX_MEMBERS && (
                <Link href="/team" className="mt-3 inline-block border border-dashed border-hairline px-3 py-1.5 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime">
                  + Invite a teammate
                </Link>
              )}
            </div>

            <div>
              <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Share your page</p>
              <CopyLink path={`/t/${slug}`} />
            </div>

            <div>
              <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Activity</p>
              <ol className="max-h-80 overflow-y-auto border-t border-dashed border-hairline">
                {activity.map((a) => (
                  <li key={a.id} className="border-b border-dashed border-hairline py-2.5 font-plex text-xs">
                    {a.member_name ? (
                      <>
                        <span className="text-bright">{a.member_name}</span>{" "}
                        <span className="text-lightgray">{a.action.charAt(0).toLowerCase() + a.action.slice(1)}</span>
                      </>
                    ) : (
                      <span className="text-lightgray">{a.action}</span>
                    )}
                    <span className="float-right text-lightgray">{clock.format(a.created_at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
