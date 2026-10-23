import type { Metadata } from "next";
import Link from "next/link";
import PrintButton from "../../../_kit/PrintButton";
import { PrintPage, StaffGate } from "../../../_kit/shell";
import { printValues } from "../values";

export const metadata: Metadata = { title: "Paper stock", robots: { index: false } };

// Pre-numbered paper stock for a full outage (T-FB-03, fallback/10):
// P-OFF-#### temporary badges, H-P### help tickets, S-P### receipts. These
// prefixes can't collide with online codes (P-#### digits only, H-#### digits
// only, S-XXXX from an alphabet without 0 or 1).

const KINDS = {
  p: { label: "P-OFF badges", code: (n: number) => `P-OFF-${String(n).padStart(4, "0")}`, lines: ["Name", "Roster row / Luma id", "Admission: YES / NO / NEEDS_RECONCILIATION", "Staff initials · time"] },
  h: { label: "H- help tickets", code: (n: number) => `H-P${String(n).padStart(3, "0")}`, lines: ["P-code / team / table", "Category · priority", "Problem in one sentence", "Claimed by · time"] },
  s: { label: "S- receipt stubs", code: (n: number) => `S-P${String(n).padStart(3, "0")}`, lines: ["Team · received at (actual time + zone)", "Commit SHA / archive SHA-256", "Officer · witness", "Incident id"] },
} as const;

type Kind = keyof typeof KINDS;

export default function StockPage({ searchParams }: PageProps<"/ops/recovery/print/stock">) {
  return (
    <PrintPage title="Pre-numbered paper stock">
      <StaffGate roles={["organizer", "mentor"]} next="/ops/recovery/print/stock">
        {async () => {
          const sp = await searchParams;
          const kind: Kind = sp.kind === "h" || sp.kind === "s" ? sp.kind : "p";
          const from = Math.max(1, Math.min(9000, Number(sp.from) || 1));
          const count = Math.max(8, Math.min(96, Number(sp.count) || 24));
          const k = KINDS[kind];
          const v = await printValues();
          const codes = Array.from({ length: count }, (_, i) => k.code(from + i));
          const next = from + count;
          return (
            <div className="space-y-6">
              <div className="no-print space-y-3">
                <nav aria-label="Stock type" className="flex flex-wrap gap-2">
                  {(Object.keys(KINDS) as Kind[]).map((id) => (
                    <Link
                      key={id}
                      href={`/ops/recovery/print/stock?kind=${id}&from=1&count=${count}`}
                      aria-current={id === kind ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center border px-3 font-plex text-xs ${id === kind ? "border-lime bg-lime-deep text-lime" : "border-hairline text-bright hover:border-lime hover:text-lime"}`}
                    >
                      {KINDS[id].label}
                    </Link>
                  ))}
                </nav>
                <p className="font-plex text-sm text-lightgray">
                  Printing {codes[0]} – {codes[codes.length - 1]}.{" "}
                  <Link href={`/ops/recovery/print/stock?kind=${kind}&from=${next}&count=${count}`} className="text-bright underline underline-offset-4 hover:text-lime">
                    Next batch from {k.code(next)} →
                  </Link>{" "}
                  Keep a note of the last number used so batches never overlap.
                </p>
                <PrintButton label={`Print ${count} slips`} />
              </div>
              <div className="print-paper grid grid-cols-1 gap-0 sm:grid-cols-2">
                {codes.map((c) => (
                  <div key={c} className="print-avoid-break border border-dashed border-hairline p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-dots text-3xl leading-none font-black text-bright">{c}</p>
                      <p className="font-pixel text-[9px] uppercase tracking-[0.2em] text-lightgray">{v.eventName}</p>
                    </div>
                    <ul className="mt-3 space-y-3 font-plex text-[11px] text-lightgray">
                      {k.lines.map((l) => (
                        <li key={l} className="border-b border-hairline pb-1">
                          {l}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-plex text-[9px] text-lightgray">No passwords, tokens or secrets. Reconcile by this number.</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      </StaffGate>
    </PrintPage>
  );
}
