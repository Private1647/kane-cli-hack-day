import type { Metadata } from "next";
import Link from "next/link";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import PrintButton from "../../_kit/PrintButton";
import { PrintPage, StaffGate, fmtTime } from "../../_kit/shell";
import { fallbackDocs } from "./docs";
import Markdown from "./Markdown";
import { printValues } from "./values";

export const metadata: Metadata = { title: "Print kit", robots: { index: false } };

// The offline print kit (T-FB-01): all eleven fallback documents with the real
// deadline, contacts and roster version filled in. Ink on paper when printed,
// one document per page. ?doc=05 prints a single document (e.g. more receipts).

export default function PrintKitPage({ searchParams }: PageProps<"/ops/recovery/print">) {
  return (
    <PrintPage title="Print kit">
      <StaffGate roles={["organizer", "mentor"]} next="/ops/recovery/print">
        {async () => {
          const sp = await searchParams;
          const v = await printValues();
          const docs = fallbackDocs(v);
          const only = typeof sp.doc === "string" ? docs.filter((d) => d.id === sp.doc) : [];
          const shown = only.length ? only : docs;
          const missing = (["incidentCommander", "submissionOfficer", "witness", "helpContact", "wifi", "rosterVersion"] as const).filter((k) => !v[k]);
          return (
            <div className="space-y-6">
              <div className="no-print space-y-4">
                {v.fallback && (
                  <DegradedServiceAlert state="degraded" system="Event clock">
                    The database couldn&apos;t be read; times below are the hackday.ts defaults. Check them before printing.
                  </DegradedServiceAlert>
                )}
                {missing.length > 0 && (
                  <DegradedServiceAlert state="delayed" system="Blanks" manualRoute="/ops/settings#values" manualLabel="Fill event values">
                    Not set yet, so they print as blank lines: {missing.join(", ")}.
                  </DegradedServiceAlert>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <PrintButton label={only.length ? `Print ${only[0].file}` : "Print all 11"} />
                  <Link href="/ops/recovery/print" className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs ${only.length ? "border-hairline text-bright" : "border-lime bg-lime-deep text-lime"}`}>
                    All
                  </Link>
                  {docs.map((d) => (
                    <Link
                      key={d.id}
                      href={`/ops/recovery/print?doc=${d.id}`}
                      aria-current={only[0]?.id === d.id ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs ${only[0]?.id === d.id ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
                    >
                      {d.id}
                    </Link>
                  ))}
                  <Link href="/ops/recovery/print/signage" className="inline-flex min-h-11 items-center px-3 font-plex text-xs text-lightgray underline-offset-4 hover:text-lime hover:underline">
                    QR posters →
                  </Link>
                  <Link href="/ops/recovery/print/stock" className="inline-flex min-h-11 items-center px-3 font-plex text-xs text-lightgray underline-offset-4 hover:text-lime hover:underline">
                    Numbered stock →
                  </Link>
                </div>
              </div>

              {!only.length && (
                <section className="print-paper print-break brackets border border-hairline p-6 sm:p-10">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">Kane Hack OS · event-day fallback print kit</p>
                  <h2 className="mt-8 font-display text-4xl leading-tight font-bold text-bright sm:text-5xl">Keep the hackathon running.</h2>
                  <p className="mt-4 font-plex text-sm text-lightgray">
                    {v.eventName} · {v.date} · {v.timezone}
                  </p>
                  <dl className="mt-8 grid gap-x-8 gap-y-3 font-plex text-sm sm:grid-cols-2">
                    {[
                      ["Official submission lock", v.lock],
                      ["Team lock / idea lock", `${v.teamLock} / ${v.ideaLock}`],
                      ["Demos start", v.demos],
                      ["Venue", v.venue],
                      ["Wi-Fi", v.wifi],
                      ["Help on the ground", v.helpContact],
                      ["Incident commander", v.incidentCommander],
                      ["Roster version", v.rosterVersion],
                    ].map(([k, val]) => (
                      <div key={k} className="border-b border-hairline pb-2">
                        <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{k}</dt>
                        <dd className="mt-1 text-bright">{val || "__________________"}</dd>
                      </div>
                    ))}
                  </dl>
                  <ol className="mt-8 list-decimal space-y-1 pl-5 font-plex text-xs text-lightgray">
                    {docs.map((d) => (
                      <li key={d.id}>
                        {d.title} <span className="text-lightgray">({d.file})</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-8 font-plex text-xs text-lightgray">
                    Tier 0 must survive: check-in, help, official submission. Printed {fmtTime(v.generatedAt, v.timezone)} from {v.site}. Fill original source IDs and staff signatures.
                  </p>
                </section>
              )}

              {shown.map((d) => (
                <article key={d.id} className="print-paper print-break border border-hairline p-6 sm:p-10">
                  <p className="mb-4 font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">Fallback / {d.file}</p>
                  <Markdown md={d.md} />
                  <p className="mt-8 border-t border-hairline pt-2 font-pixel text-[9px] uppercase tracking-[0.2em] text-lightgray">
                    Kane Hack OS · offline staff copy · fill original source IDs and staff signatures
                  </p>
                </article>
              ))}
            </div>
          );
        }}
      </StaffGate>
    </PrintPage>
  );
}
