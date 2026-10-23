import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { challenge } from "@/data/hackday";
import { formatEventTime, getEvent } from "@/lib/event";
import { getMember } from "@/server/auth";
import { currentTeamOf } from "@/server/teams";
import { CreateTeamForm } from "../parts";

export const metadata: Metadata = { title: "Start a team" };

export default function NewTeamPage() {
  return (
    <main>
      <PageHeader eyebrow="Team / new" dim="Start a team," bright="You're the captain." intro="Up to 4 people. Your team page and showcase address are reserved from the name." />
      <section className="py-12 sm:py-16">
        <div className="container-page max-w-xl">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <Gate />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Gate() {
  const [member, event] = await Promise.all([getMember(), getEvent()]);
  if (!member) {
    return (
      <div className="space-y-4 font-plex text-sm text-lightgray">
        <p>Sign in first, then come back here.</p>
        <Button href="/team" className="min-h-11">
          Sign-in options →
        </Button>
      </div>
    );
  }
  const cur = await currentTeamOf(member.id);
  if (cur) {
    return (
      <div className="space-y-4 font-plex text-sm text-lightgray">
        <p>
          You&apos;re on <span className="text-bright">{cur.name}</span>. Leave it first if you want to start another team.
        </p>
        <Button href={`/team/${cur.slug}/manage`} className="min-h-11">
          Your team →
        </Button>
      </div>
    );
  }
  const locked = event.now >= event.teamLockAt;
  return (
    <div className="space-y-6">
      {locked && (
        <p className="border-l-2 border-warning pl-3 font-plex text-sm text-warning">
          Teams locked at {formatEventTime(event.teamLockAt, event)}. You can still create a team to ship solo; adding people now needs an organizer.
        </p>
      )}
      <CreateTeamForm tracks={[...challenge.tracks]} idempotencyKey={randomUUID()} />
    </div>
  );
}
