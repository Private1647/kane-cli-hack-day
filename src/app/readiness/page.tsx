import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CopyField from "@/components/ui/CopyField";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import PageHeader from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { getEvent } from "@/lib/event";
import { getMember } from "@/server/auth";
import { siteUrl } from "@/server/core";
import { getReadiness, type ReadinessCheckResult } from "@/server/passport";
import ReadinessDoctor from "./ReadinessDoctor";

export const metadata: Metadata = { title: "Kane readiness", robots: { index: false } };

// /readiness: the hack-doctor checklist (T-ACT-08). Shows the latest answer
// for every check, from a paired machine (kanehack / hack-doctor) or
// self-reported here, with the exact fix for anything not passing. Partial
// readiness is normal. Reported results are never shown as VERIFIED.

export default function ReadinessPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Readiness"
        dim="Kane CLI doctor,"
        bright="Ready to build?"
        intro="Eleven checks between you and your first Kane run. Each failing one comes with the exact fix. You don’t need all of them to start."
      />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading checks…</p>}>
            <Body />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Body() {
  const member = await getMember();
  if (!member) {
    return (
      <div className="max-w-xl space-y-4 font-plex text-sm">
        <p className="text-bright">Sign in to save your checks. Your agent can also report them after pairing.</p>
        <Link href="/passport/login?next=/readiness" className="inline-flex min-h-11 items-center bg-bright px-5 text-ink transition-colors hover:bg-lime">
          Sign in →
        </Link>
      </div>
    );
  }
  const [r, ev] = await Promise.all([getReadiness(member.id), getEvent()]);
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end gap-8 border-b border-dashed border-hairline pb-6">
          <Count n={r.passed} label="Passing" />
          <Count n={r.failed} label="Need a fix" />
          <Count n={r.missing} label="Not reported" />
          <div className="ml-auto">
            {r.at ? (
              <FreshnessStamp asOf={r.at} now={ev.now} staleAfterSec={3600} source={r.source === "cli" ? "paired machine" : "self-reported"} />
            ) : (
              <span className="font-plex text-xs text-lightgray">No report yet</span>
            )}
          </div>
        </div>
        <ul className="space-y-3">
          {r.checks.map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </ul>
      </div>
      <aside className="space-y-8">
        <div className="brackets border border-hairline bg-surface p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-bright">Let your agent run it</h2>
          <p className="mt-2 font-plex text-sm text-lightgray">
            Pair once with <code className="text-bright">kanehack login</code> (approve the code at{" "}
            <Link href="/pair" className="text-bright underline underline-offset-4 hover:text-lime">
              /pair
            </Link>
            ), then ask your agent to run <span className="text-bright">hack-doctor</span>. It posts the results here.
          </p>
          <CopyField className="mt-4" value={`curl -X POST ${siteUrl("/api/v1/readiness")} \\\n  -H "Authorization: Bearer $KANEHACK_TOKEN" \\\n  -H "content-type: application/json" \\\n  -d '{"checks":[{"id":"kane_version","status":"pass","version":"x.y.z"}]}'`} />
        </div>
        <div className="border border-hairline p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-bright">Check by hand</h2>
          <div className="mt-4">
            <ReadinessDoctor checks={r.checks.map(({ id, label, status, command, fix, detail }) => ({ id, label, status, command, fix, detail }))} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-dots text-5xl leading-none font-black text-bright">{n}</p>
      <p className="mt-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</p>
    </div>
  );
}

function CheckRow({ c }: { c: ReadinessCheckResult }) {
  const reported = c.detail !== null || c.status !== "skip";
  return (
    <li className="border border-hairline bg-surface p-4" data-check={c.id} data-status={c.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-plex text-sm text-bright">{c.label}</p>
        {c.status === "pass" ? (
          c.observed_by_server ? (
            <StatusPill tone="verified">Verified · server saw it</StatusPill>
          ) : (
            <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-bright">✓ Reported OK</span>
          )
        ) : c.status === "fail" ? (
          <StatusPill tone="danger">Needs a fix</StatusPill>
        ) : c.status === "warn" ? (
          <StatusPill tone="pending">Check this</StatusPill>
        ) : (
          <StatusPill tone="unverified">{reported ? "Not sure" : "Not reported"}</StatusPill>
        )}
      </div>
      {(c.detail || c.version) && (
        <p className="mt-1 font-plex text-xs text-lightgray">
          {c.version && <span className="text-bright">{c.version} </span>}
          {c.detail}
        </p>
      )}
      {c.fix && c.status !== "pass" && <p className="mt-2 font-plex text-xs leading-relaxed text-lightgray">Fix: {c.fix}</p>}
    </li>
  );
}
