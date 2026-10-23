import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import QR from "@/components/ui/QR";
import LiveTV from "@/components/live/LiveTV";
import PhaseControl from "@/components/live/PhaseControl";
import { getEvent } from "@/lib/event";
import { siteUrl } from "@/server/core";
import { hasRole } from "@/server/auth";
import { getLiveSnapshot, getOpsViewer, offlineSnapshot, type LiveSnapshot } from "@/server/metrics";

// Mission Control: the room TV (1920×1080) and, at /live?ops=1, the private
// Ops TV for organizers and mentors (help queue ages, incidents, phase
// override). The first frame is rendered here from the projection; LiveTV then
// stays current over SSE. If nothing can be read, it still renders the clock,
// schedule and QR codes with an OFFLINE banner.

export const metadata: Metadata = {
  title: "Live",
  description: "Mission Control: the room, in motion. Verified, de-duplicated live signals from Kane CLI Hack Day.",
};

export default function LivePage({ searchParams }: PageProps<"/live">) {
  return (
    <Suspense fallback={<Loading />}>
      <LiveView searchParams={searchParams} />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink">
      <p className="font-pixel text-[11px] uppercase tracking-[0.25em] text-lightgray">Mission Control · connecting…</p>
    </div>
  );
}

async function LiveView({ searchParams }: { searchParams: PageProps<"/live">["searchParams"] }) {
  await connection(); // live data, every request
  const sp = await searchParams;
  const wantsOps = sp.ops === "1";

  const staff = wantsOps ? await getOpsViewer() : null;
  if (wantsOps && !staff) {
    return (
      <main className="container-page space-y-4 py-16">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Ops TV</p>
        <h1 className="font-display text-4xl font-bold">Staff only.</h1>
        <p className="max-w-lg font-plex text-sm text-lightgray">The Ops TV shows help queue ages and incidents. Sign in as an organizer or mentor.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/ops/login?next=%2Flive%3Fops%3D1" className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
            Staff sign in →
          </Link>
          <Link href="/live" className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm hover:border-bright">
            Public TV
          </Link>
        </div>
      </main>
    );
  }
  const ops = !!staff;

  let snap: LiveSnapshot;
  try {
    snap = await getLiveSnapshot({ ops });
  } catch (err) {
    console.error("[live] first frame offline", err);
    const e = await getEvent();
    snap = offlineSnapshot(e.now, e);
  }

  const small = 84;
  return (
    <LiveTV
      initial={snap}
      ops={ops}
      qrHelp={<QR value={siteUrl("/help")} size={small} label="QR code: open the help desk" caption="Help" />}
      qrTeams={<QR value={siteUrl("/match")} size={small} label="QR code: open the team finder" caption="Find a team" />}
      qrBig={{
        help: <QR value={siteUrl("/help")} size={220} label="QR code: request help" caption={siteUrl("/help").replace("https://", "")} />,
        teams: <QR value={siteUrl("/match")} size={220} label="QR code: find a team" caption={siteUrl("/match").replace("https://", "")} />,
        ship: <QR value={siteUrl("/ship")} size={220} label="QR code: browse every ship page" caption={siteUrl("/ship").replace("https://", "")} />,
      }}
      opsControls={ops && hasRole(staff, "organizer") ? <PhaseControl current={snap.event.phase} source={snap.event.phase_source} /> : null}
    />
  );
}
