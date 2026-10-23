import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { challenge, event } from "@/data/hackday";
import { PROGRESS_ITEMS, shippedMinimum } from "@/lib/progress";
import { isAdmin } from "@/lib/session";
import { isRegistrationOpen, listTeams } from "@/lib/teams";
import { AdminBar, AdminLogin, TeamsTable, type TeamRow } from "./parts";
import { listTeamPhotoStats } from "./queries";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <main>
      <PageHeader eyebrow="Admin" dim="Every team," bright="One view." />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <AdminView />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

async function AdminView() {
  if (!(await isAdmin())) return <AdminLogin />;

  const [teams, open, photoStats] = await Promise.all([listTeams(), isRegistrationOpen(), listTeamPhotoStats()]);
  const photosByTeam = new Map(photoStats.map((p) => [p.team_id, p]));
  const rows: TeamRow[] = teams.map((t) => {
    const done = new Set(t.done_items);
    const p = photosByTeam.get(t.id);
    return {
      slug: t.slug,
      name: t.name,
      track: t.track,
      isSolo: t.is_solo,
      members: t.member_names,
      done: done.size,
      total: PROGRESS_ITEMS.length,
      shipped: shippedMinimum(done),
      lastActivity: t.last_activity ? clock.format(t.last_activity) : "—",
      photos: {
        team: p?.has_photo ?? false,
        consented: p?.consented ?? 0,
        declined: p?.declined ?? 0,
        selfies: p?.selfies ?? 0,
        socials: p?.socials ?? 0,
        members: p?.member_count ?? t.member_count,
        gallery: p?.gallery ?? 0,
      },
    };
  });

  const stats = [
    { label: "Teams", value: teams.filter((t) => !t.is_solo).length },
    { label: "Solo", value: teams.filter((t) => t.is_solo).length },
    { label: "Hackers", value: teams.reduce((n, t) => n + t.member_count, 0) },
    { label: "Shipped", value: rows.filter((r) => r.shipped).length },
    { label: "Team photos", value: rows.filter((r) => r.photos.team).length },
    { label: "Said yes", value: rows.reduce((n, r) => n + r.photos.consented, 0) },
  ];

  return (
    <div className="space-y-10">
      <AdminBar registrationOpen={open} />
      <dl className="grid grid-cols-2 border-t border-l border-hairline sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="border-r border-b border-hairline p-4">
            <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{s.label}</dt>
            <dd className="mt-2 font-dots text-5xl leading-none font-black text-bright">{s.value}</dd>
          </div>
        ))}
      </dl>
      <TeamsTable rows={rows} tracks={challenge.tracks} />
    </div>
  );
}
