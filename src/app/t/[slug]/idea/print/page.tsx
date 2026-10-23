import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireTeamMember } from "@/server/auth";
import { AppError } from "@/server/core";
import { CRITERIA, PROJECT_TYPES, PROJECT_TYPE_LABEL, getIdea, latestAssessment, type Assessment, type Idea } from "@/server/ideas";
import { getRoster, getTeamInfo, type RosterEntry, type TeamInfo } from "@/server/teams";
import { PrintButton } from "../parts";

export const metadata: Metadata = { title: "Team & idea worksheet" };

// The printable team + idea worksheet (blueprint fallback/03), filled in from
// the team's records when signed in, or blank with ?blank=1 for the paper
// fallback. Ink on white; the site chrome is hidden in print.

export default function PrintPage({ params, searchParams }: PageProps<"/t/[slug]/idea/print">) {
  return (
    <main className="print-paper min-h-screen py-8">
      <div className="container-page max-w-3xl">
        <Suspense fallback={<p className="font-plex text-sm">Loading…</p>}>
          <Sheet params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Sheet({ params, searchParams }: PageProps<"/t/[slug]/idea/print">) {
  const { slug } = await params;
  const blank = (await searchParams).blank === "1";
  if (blank) return <Worksheet />;

  const access = await requireTeamMember(slug, { allowStaff: true }).catch((err) => {
    if (err instanceof AppError) return null;
    throw err;
  });
  if (access) {
    const { team } = access;
    const [info, roster, idea] = await Promise.all([getTeamInfo({ id: team.id }), getRoster(team.id), getIdea(team.id)]);
    const latest = idea ? await latestAssessment(idea.id) : null;
    return <Worksheet team={info} roster={roster} idea={idea} assessment={latest?.assessment ?? null} />;
  }
  return (
    <div className="space-y-4 font-plex text-sm">
      <p>Sign in to your team to print a filled-in worksheet.</p>
      <Link href={`/t/${slug}/idea/print?blank=1`} className="underline underline-offset-4">
        Print a blank worksheet instead →
      </Link>
    </div>
  );
}

const YNU = { met: "Y", partial: "U", missing: "N" } as const;

function Worksheet({ team, roster = [], idea, assessment }: { team?: TeamInfo | null; roster?: RosterEntry[]; idea?: Idea | null; assessment?: Assessment | null }) {
  const captain = roster.find((r) => r.role === "captain");
  const rows: (RosterEntry | null)[] = [...roster, null, null, null, null].slice(0, Math.max(4, roster.length));
  return (
    <article className="space-y-6 font-plex text-sm text-bright">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-lightgray">Prints in black on white. Advisory checklist; not an official score.</p>
        <PrintButton />
      </div>

      <header className="border-b-2 border-bright pb-3">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em]">Kane CLI Hack Day · paper fallback</p>
        <h1 className="mt-1 font-display text-2xl">Team formation and idea validation worksheet</h1>
      </header>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Field label="Team record ID" value={team ? `T-${team.id}` : null} />
        <Field label="Team name" value={team?.name} />
        <Field label="Captain" value={captain?.name} />
      </div>

      <section className="print-avoid-break">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em]">Members (max 4)</p>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {["Participant ID", "Display name", "Joining confirmation", "Skill / interest"].map((h) => (
                <th key={h} className="border border-hairline px-2 py-1.5 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r?.member_id ?? `blank-${i}`} className="h-9">
                <td className="border border-hairline px-2">{r?.public_code ?? ""}</td>
                <td className="border border-hairline px-2">{r?.name ?? ""}</td>
                <td className="border border-hairline px-2">{r ? "joined in app" : ""}</td>
                <td className="border border-hairline px-2" />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Open roles / skills sought" value={team?.seeking_skills.join(", ")} />
        <Field label="Table / location" value={team?.table_label} />
      </div>
      <p className="text-xs">Team invite code (never use personal passwords): ______________ Creator initials: ______</p>

      <Field label="Idea summary" value={idea ? idea.public_summary ?? idea.title : null} tall />

      <div>
        <p className="mb-1 font-pixel text-[10px] uppercase tracking-[0.2em]">Type</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {PROJECT_TYPES.map((t) => (
            <span key={t}>
              [{idea?.project_type === t ? "x" : " "}] {PROJECT_TYPE_LABEL[t]}
            </span>
          ))}
        </p>
      </div>

      <section className="print-avoid-break">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em]">Eight-part validator (Y / N / U = uncertain)</p>
        <ol className="space-y-1.5">
          {CRITERIA.map((c, i) => {
            const r = assessment?.criteria.find((x) => x.id === c.id);
            return (
              <li key={c.id} className="flex items-baseline gap-2 border-b border-dashed border-hairline pb-1.5">
                <span className="w-6 shrink-0">{i + 1}.</span>
                <span className="flex-1">{c.question}</span>
                <span className="w-10 shrink-0 text-center font-display text-base">{r ? YNU[r.status] : "___"}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="print-avoid-break">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em]">Improvement actions</p>
        <ol className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="min-h-8 border-b border-hairline pb-1">
              {i + 1}. {assessment?.changes[i] ?? ""}
            </li>
          ))}
        </ol>
      </section>

      <Field label="Distinctiveness claim / possible overlap (no ownership accusation)" value={null} tall />

      <p className="text-xs">
        Idea summary discoverable to other teams? {idea ? (idea.discovery_opt_in ? "[x] YES  [ ] NO" : "[ ] YES  [x] NO") : "YES / NO"} · Captain consent: _____________
      </p>

      <p className="border-t-2 border-bright pt-3 text-xs">
        <strong>Important:</strong> Similar ideas can coexist; overlap never vetoes an eligible idea. Find a distinctive validation architecture or testable proof. This checklist is advisory and is not official judging.
        {assessment && ` Checked ${assessment.generator === "llm" ? "with AI assistance" : "by rules"} at ${new Date(assessment.assessed_at).toISOString().slice(0, 16).replace("T", " ")} UTC.`}
      </p>
    </article>
  );
}

function Field({ label, value, tall = false }: { label: string; value?: ReactNode; tall?: boolean }) {
  return (
    <div>
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em]">{label}</p>
      <p className={`border-b border-hairline pb-1 ${tall ? "min-h-14" : "min-h-7"}`}>{value || ""}</p>
    </div>
  );
}
