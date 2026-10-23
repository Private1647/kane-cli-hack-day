import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { Label, inputCls } from "@/components/forms/fields";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { formatEventTime } from "@/lib/event";
import { getMember } from "@/server/auth";
import { currentTeamOf, previewInvite } from "@/server/teams";
import { ConfirmJoinForm } from "../parts";
import { StateLine } from "../blocks";

export const metadata: Metadata = { title: "Join a team" };

// Join is two explicit steps: look at what the code points to, then confirm.

export default function JoinPage({ searchParams }: PageProps<"/team/join">) {
  return (
    <main>
      <PageHeader eyebrow="Team / join" dim="Got a code?" bright="Join your team." intro="Invite codes are one-time and expire. Nothing happens until you confirm." />
      <section className="py-12 sm:py-16">
        <div className="container-page max-w-xl">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <Join searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Join({ searchParams }: Pick<PageProps<"/team/join">, "searchParams">) {
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.trim().slice(0, 40) : "";
  const member = await getMember();

  const codeForm = (
    <form method="get" action="/team/join" className="space-y-3">
      <Label htmlFor="join-code">Invite code</Label>
      <input id="join-code" name="code" defaultValue={code} required autoComplete="off" autoCapitalize="characters" placeholder="ABCD-EFGH" className={`${inputCls} font-dots text-xl tracking-[0.2em]`} />
      <button type="submit" className="inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
        Look up code →
      </button>
    </form>
  );

  if (!code) return codeForm;

  const preview = await previewInvite(code, member);
  if (!preview) {
    return (
      <div className="space-y-6">
        <p role="alert" className="border-l-2 border-danger pl-3 font-plex text-sm text-danger">
          That code has expired, was already used, or was revoked. Ask the team for a fresh one.
        </p>
        {codeForm}
      </div>
    );
  }

  const { team } = preview;
  return (
    <div className="space-y-8">
      <div className="brackets border border-hairline p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Invite to</p>
          <StateLine state={team.locked ? "roster_locked" : "recruiting"} locked={team.locked} />
        </div>
        <p className="mt-3 font-display text-3xl text-bright">{team.name}</p>
        <p className="mt-1 font-plex text-sm text-lightgray">
          {team.member_count}/{team.cap} · {team.track} · code expires {formatEventTime(preview.expiresAt)}
        </p>
        {team.summary_public && <p className="mt-3 font-plex text-sm text-lightgray">{team.summary_public}</p>}
      </div>
      {!member ? (
        <div className="space-y-4 font-plex text-sm text-lightgray">
          <p>Sign in as yourself to accept. Your registration stays yours; joining only links you to this team.</p>
          <Button href="/team" className="min-h-11">
            Sign-in options →
          </Button>
        </div>
      ) : !preview.forYou ? (
        <p role="alert" className="border-l-2 border-danger pl-3 font-plex text-sm text-danger">
          This invite was made for a different participant.
        </p>
      ) : team.locked ? (
        <p role="alert" className="border-l-2 border-warning pl-3 font-plex text-sm text-warning">
          This team&apos;s roster is locked. An organizer can still add you at the help desk.
        </p>
      ) : team.member_count >= team.cap ? (
        <p role="alert" className="border-l-2 border-warning pl-3 font-plex text-sm text-warning">
          This team is full ({team.member_count}/{team.cap}). Try the matchmaker for open seats.
        </p>
      ) : (
        <ConfirmJoinForm code={code} teamName={team.name} idempotencyKey={randomUUID()} switching={(await currentTeamOf(member.id))?.name ?? null} />
      )}
    </div>
  );
}
