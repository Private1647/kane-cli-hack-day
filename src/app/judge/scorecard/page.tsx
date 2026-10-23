import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { event, judging } from "@/data/hackday";
import { getStaff, hasRole } from "@/server/auth";
import { listJudgeQueue, type QueueItem } from "@/server/judging";
import PrintButton from "./PrintButton";

export const metadata: Metadata = { title: "Judge scorecard", robots: { index: false } };

// Paper fallback (T-JUDGE-05): the rubric as a printable card, ink on white.
// Blank by default (the rubric is public). A signed-in judge can print one
// pre-filled card per submission with ?all=1. Paper scores are typed into
// /judge once the system is back; the card number keeps them traceable.

export default function ScorecardPage({ searchParams }: PageProps<"/judge/scorecard">) {
  return (
    <main className="print-paper min-h-screen py-8">
      <div className="container-page">
        <Suspense fallback={<Card />}>
          <Cards searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Cards({ searchParams }: Pick<PageProps<"/judge/scorecard">, "searchParams">) {
  const sp = await searchParams;
  const staff = await getStaff();
  const judge = hasRole(staff, "judge", "organizer");
  const items = judge && sp.all === "1" ? await listJudgeQueue(staff!.id) : [];

  return (
    <>
      <div className="no-print mb-8 flex flex-wrap items-center gap-3 font-plex text-sm">
        <PrintButton>{items.length ? `Print ${items.length} cards` : "Print blank card"}</PrintButton>
        {judge && !items.length && (
          <Link href="/judge/scorecard?all=1" className="inline-flex min-h-11 items-center border border-[#999] px-4 hover:underline">
            One card per submission
          </Link>
        )}
        <Link href="/judge" className="inline-flex min-h-11 items-center px-2 hover:underline">
          ← Judge console
        </Link>
      </div>
      {items.length ? items.map((i, n) => <Card key={i.id} item={i} n={n + 1} />) : <Card />}
    </>
  );
}

const line = "border-b border-[#999] min-h-7";
const head = "font-pixel text-[10px] uppercase tracking-[0.2em]";

function Card({ item, n }: { item?: QueueItem; n?: number }) {
  return (
    <article className="print-break print-avoid-break mb-10 border border-black p-5 text-black">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black pb-3">
        <div>
          <p className={head}>{event.name} · Judge scorecard</p>
          <p className="mt-1 font-display text-xl font-semibold">{item ? item.team_name : "Team ______________________"}</p>
        </div>
        <p className="font-plex text-xs">
          Card {n ? `#${n}` : "#____"} · {judging.rubricVersion}
        </p>
      </header>

      <div className="mt-3 grid gap-3 font-plex text-xs sm:grid-cols-4">
        <p>
          Table <span className={`inline-block w-16 ${line}`}>{item?.table_label ?? ""}</span>
        </p>
        <p>
          Receipt <span className={`inline-block w-20 ${line}`}>{item?.receipt_code ?? ""}</span>
        </p>
        <p className="sm:col-span-2">
          Judge <span className={`inline-block w-40 ${line}`} />
        </p>
        <p className="sm:col-span-4">
          Round: ☐ Mid (feedback only) &nbsp; ☐ Final (scored) &nbsp; ☐ Stage (scored) &nbsp;&nbsp; Time <span className={`inline-block w-20 ${line}`} />
        </p>
      </div>

      <table className="mt-4 w-full border-collapse font-plex text-xs">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1.5 pr-2 font-normal">Category</th>
            <th className="w-10 py-1.5 font-normal">Wt</th>
            <th className="py-1.5 font-normal">Anchor (circle one)</th>
            <th className="w-16 py-1.5 font-normal">Points</th>
          </tr>
        </thead>
        <tbody>
          {judging.rubric.map((r) => (
            <tr key={r.key} className="border-b border-[#999] align-top">
              <td className="py-2 pr-2">
                <span className="font-semibold">{r.name}</span>
                <span className="block text-[10px] text-[#444]">{r.inspect}</span>
                <span className="mt-1 block text-[10px]">
                  Evidence: <span className={`inline-block w-full ${line}`} />
                </span>
              </td>
              <td className="py-2">{r.points}</td>
              <td className="py-2 whitespace-nowrap">
                {judging.anchors.map((a) => (
                  <span key={a.score} className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-black">
                    {a.score}
                  </span>
                ))}
              </td>
              <td className="py-2">
                <span className={`inline-block w-12 ${line}`} />
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="py-2 text-right font-semibold">
              Total (of 100)
            </td>
            <td className="py-2">
              <span className={`inline-block w-12 ${line}`} />
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 font-plex text-[10px]">
        Anchors: {judging.anchors.map((a) => `${a.score} ${a.label.toLowerCase()}`).join(" · ")}. Points = anchor × weight / 5.
      </p>

      <div className="mt-4 space-y-2 font-plex text-xs">
        <p>What I couldn&apos;t verify (required if any category has no evidence):</p>
        <div className={line} />
        <div className={line} />
        <p className="pt-2">Comments / feedback for the team:</p>
        <div className={line} />
        <div className={line} />
      </div>

      <footer className="mt-4 flex flex-wrap justify-between gap-2 border-t border-black pt-2 font-plex text-[10px]">
        <span>Scores are human decisions. No AI fills a mark. Committed scores can&apos;t change.</span>
        <span>Signature ____________________</span>
      </footer>
    </article>
  );
}
