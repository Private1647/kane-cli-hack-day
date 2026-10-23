import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import Help from "@/components/home/Help";
import PageHeader from "@/components/ui/PageHeader";
import { query } from "@/lib/db";
import { getViewer, hasRole } from "@/server/auth";
import { HelpDesk } from "./views";

export const metadata: Metadata = { title: "Help" };

// Help for everyone: members without a team (hd_member cookie) open tickets
// here; team members are pointed at their hub tab (same queue). Signed-out
// visitors get the paper route, which always works.
export default function HelpPage() {
  return (
    <main>
      <PageHeader eyebrow="Help" dim="Stuck?" bright="Ask a mentor." intro="Open a ticket and a mentor comes to your table. Every ticket gets an H-number you can quote at the help desk." />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
            <HelpView />
          </Suspense>
        </div>
      </section>
      <Help />
    </main>
  );
}

async function HelpView() {
  const { member, team, staff } = await getViewer();
  const staffLink = hasRole(staff, "mentor", "organizer") && (
    <p className="mb-8 font-plex text-sm text-lightgray">
      You&apos;re signed in as staff.{" "}
      <Link href="/ops/help" className="inline-flex min-h-11 items-center text-lime underline underline-offset-4 hover:text-bright">
        Open the mentor queue →
      </Link>
    </p>
  );

  if (!member) {
    return (
      <div className="max-w-2xl space-y-6">
        {staffLink}
        <p className="font-plex text-sm text-lightgray">Sign in so mentors know who and where you are, and so you can follow your ticket.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login?next=help" className="inline-flex min-h-11 items-center bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime">
            Sign in →
          </Link>
        </div>
        <div className="border-l-2 border-hairline pl-4 font-plex text-sm text-lightgray">
          <p className="text-bright">Can&apos;t sign in?</p>
          <p className="mt-1">Walk to the help desk and ask for a paper ticket. It gets a numbered H-code and joins the same queue; staff type it in with the time you asked.</p>
        </div>
      </div>
    );
  }

  const [t] = team ? await query<{ table_label: string | null }>("select table_label from teams where id = $1", [team.id]).catch(() => []) : [];
  return (
    <>
      {staffLink}
      {team && (
        <p className="mb-8 font-plex text-sm text-lightgray">
          You&apos;re on <span className="text-bright">{team.name}</span>. Your team&apos;s tickets are also on the{" "}
          <Link href={`/t/${team.slug}/help`} className="text-lime underline underline-offset-4 hover:text-bright">
            hub Help tab
          </Link>
          .
        </p>
      )}
      <HelpDesk memberId={member.id} teamId={team?.id ?? null} defaultTable={t?.table_label ?? null} canCreate />
    </>
  );
}
