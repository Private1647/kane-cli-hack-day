import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import QR from "@/components/ui/QR";
import { event } from "@/data/hackday";
import { siteUrl } from "@/server/core";
import { getBadge } from "@/server/roster";
import PrintButton from "../../../_kit/PrintButton";
import { StaffGate, fmtTime } from "../../../_kit/shell";

export const metadata: Metadata = { title: "Badge", robots: { index: false } };

// A printable / showable badge: name, P-code, team and a QR that opens this
// person at the check-in desk. No email, no token: the QR is only useful to
// signed-in staff, and the P-code is the offline id on every paper form.

export default function BadgePage({ params }: PageProps<"/ops/checkin/badge/[code]">) {
  return (
    <main className="py-10">
      <div className="container-page">
        <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading…</p>}>
          <StaffGate roles={["organizer", "mentor"]} next="/ops/checkin">
            {async () => {
              const code = decodeURIComponent((await params).code).slice(0, 20);
              const b = await getBadge(code);
              if (!b) {
                return (
                  <p className="font-plex text-sm text-lightgray">
                    No member with code {code}.{" "}
                    <Link href="/ops/checkin" className="underline underline-offset-4 hover:text-lime">
                      Back to check-in
                    </Link>
                  </p>
                );
              }
              const lookup = siteUrl(`/ops/checkin?q=${encodeURIComponent(b.publicCode)}`);
              return (
                <div className="space-y-6">
                  <div className="no-print flex flex-wrap items-center gap-3">
                    <Link href={`/ops/checkin?q=${encodeURIComponent(b.publicCode)}`} className="inline-flex min-h-11 items-center font-plex text-sm text-lightgray hover:text-lime">
                      ← Check-in
                    </Link>
                    <PrintButton label="Print badge" />
                  </div>
                  {/* Credit-card-ish proportions so it fits a lanyard sleeve; ink on paper when printed. */}
                  <article className="print-paper print-avoid-break brackets mx-auto w-full max-w-[22rem] border border-hairline p-6" aria-label={`Badge for ${b.displayName ?? b.name}`}>
                    <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">
                      {event.name} · {event.city}
                    </p>
                    <p className="mt-6 font-display text-4xl leading-tight font-bold break-words text-bright">{b.displayName ?? b.name}</p>
                    {b.displayName && b.displayName !== b.name && <p className="mt-1 font-plex text-xs text-lightgray">{b.name}</p>}
                    <p className="mt-3 font-plex text-sm text-lightgray">{b.teamName ? `Team ${b.teamName}` : "Team: join or create one next"}</p>
                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Participant</p>
                        <p className="font-dots text-5xl leading-none font-black text-bright">{b.publicCode}</p>
                      </div>
                      <QR value={lookup} size={112} label={`QR code: open ${b.publicCode} at the check-in desk`} />
                    </div>
                    <p className="mt-6 font-plex text-[11px] leading-relaxed text-lightgray">
                      Quote {b.publicCode} at the help desk and on paper forms. Selfie and photo permissions are optional and separate.
                    </p>
                  </article>
                  <p className="no-print text-center font-plex text-xs text-lightgray">
                    {b.checkedInAt ? `Checked in ${fmtTime(b.checkedInAt)}` : "Not checked in yet"} · {b.source === "walk_in" ? "walk-in" : b.source ? "roster" : "no roster row"}
                  </p>
                </div>
              );
            }}
          </StaffGate>
        </Suspense>
      </div>
    </main>
  );
}
