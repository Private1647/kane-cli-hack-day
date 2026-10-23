import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Section";
import CopyField from "@/components/ui/CopyField";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import FreshnessStamp from "@/components/ui/FreshnessStamp";
import StatusPill, { type PillTone } from "@/components/ui/StatusPill";
import EvidenceInspector from "@/components/gen/EvidenceInspector";
import KaneRunCard, { type KaneRunView } from "@/components/gen/KaneRunCard";
import { isEnabled } from "@/lib/flags";
import { getProjectByTeam, getProofOverview } from "@/server/kane";
import { serverNow } from "@/server/core";
import Hub, { type HubContext } from "../hub";
import { AutoRefresh } from "../parts";
import { DefectButtons, EvidenceUpload, ManualRunForm, MilestoneButtons, MilestoneForm } from "./parts";

export const metadata: Metadata = { title: "Proof" };

// The Proof tab (E7): every Kane run the team reported, what it proves and
// how far to trust it, the defects it detected, milestones with their
// evidence, the evidence files, coverage and the GitHub commit timeline.
// Trust words are exact: VERIFIED only for source-verified runs/evidence;
// a failing run is a DETECTION; a hand-entered run is UNVERIFIED.

export default function ProofTab({ params }: PageProps<"/t/[slug]/proof">) {
  return (
    <Hub params={params} tab="proof">
      {(ctx) => <Proof {...ctx} />}
    </Hub>
  );
}

const DEFECT: Record<string, { tone: PillTone; label: string; help: string }> = {
  suspected: { tone: "suspected", label: "Suspected", help: "A failing run detected this. Is it a real product bug?" },
  confirmed: { tone: "danger", label: "Confirmed bug", help: "A teammate confirmed it. Fix it, then re-run on a new commit." },
  fixed: { tone: "pending", label: "Fixed · awaiting re-run", help: "Re-run the same test on a new commit to verify the fix." },
  reverified: { tone: "verified", label: "Verified fix", help: "A later passing run on a different commit re-verified it." },
  not_a_bug: { tone: "unverified", label: "Not a bug", help: "Closed by the team." },
};

const MS_TONE: Record<string, PillTone> = { verified: "verified", participant_reported: "unverified", inferred: "suspected" };
const MS_WORD: Record<string, string> = { verified: "Verified", participant_reported: "Unverified · reported", inferred: "Unverified · no evidence" };

function Block({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-dashed border-hairline py-10">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={`${id}-h`} className="mt-2 font-display text-2xl text-bright sm:text-3xl">
        {title}
      </h2>
      {intro && <div className="mt-2 max-w-2xl font-plex text-sm leading-relaxed text-lightgray">{intro}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Stat({ value, label, tone = "text-bright" }: { value: number | null; label: string; tone?: string }) {
  return (
    <div className="border-l border-hairline pl-4 first:border-l-0 first:pl-0">
      <p className={`font-dots text-4xl leading-none font-black ${tone}`}>{value ?? "—"}</p>
      <p className="mt-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</p>
    </div>
  );
}

async function Proof({ team, members, me }: HubContext) {
  const project = await getProjectByTeam(team.id);
  if (!project) {
    return (
      <div className="container-page py-16">
        <DegradedServiceAlert state="degraded" system="Proof" manualRoute={`/t/${team.slug}/help`} manualLabel="Ask the help desk">
          This team has no project record yet. That usually means the Hack OS migrations haven’t been applied.
        </DegradedServiceAlert>
      </div>
    );
  }
  const [o, now, ingestOn] = await Promise.all([getProofOverview(project.id), serverNow(), isEnabled("kane_ingest")]);
  const nowIso = now.toISOString();
  const solo = team.is_solo || members.length <= 1;
  const latest = o.runs[0]?.received_at ?? null;

  const runViews: KaneRunView[] = o.runs.map((r) => ({
    ...r,
    summary: r.summary ?? {},
    received_at: new Date(r.received_at).toISOString(),
    members: r.members.map((m) => ({ id: m.upstream_member_id, name: m.name, status: m.status, duration_ms: m.duration_ms })),
    evidence_id: r.evidence_artifact_id,
  }));

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="container-page pb-6">
        {/* Summary strip */}
        <section aria-label="Proof summary" className="py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Proof · {project.name}</Eyebrow>
              <p className="mt-2 max-w-2xl font-plex text-sm text-lightgray">
                What your Kane runs actually show. Success comes from the exit code; a run with no completion event never counts as a pass.
              </p>
            </div>
            <FreshnessStamp asOf={latest ? new Date(latest) : null} now={nowIso} staleAfterSec={3600} source="last run reported" />
          </div>
          <div className="mt-8 grid grid-cols-2 gap-y-6 sm:grid-cols-5">
            <Stat value={o.counts.runs} label="Runs reported" />
            <Stat value={o.counts.verifiedPassed} label="Verified passes" tone="text-verified" />
            <Stat value={o.counts.suspected} label="Suspected defects" tone="text-lightgray" />
            <Stat value={o.counts.confirmed} label="Confirmed open" />
            <Stat value={o.counts.reverified} label="Fixes re-verified" tone="text-verified" />
          </div>
          {(!ingestOn || o.ingestState === "degraded" || o.ingestState === "down") && (
            <DegradedServiceAlert className="mt-6" state={!ingestOn || o.ingestState === "down" ? "down" : "degraded"} system="Kane run ingest" manualRoute="#report">
              {ingestOn ? "Reports from the CLI may be slow." : "CLI reporting is switched off."} You can still log a run by hand below; it shows as unverified.
            </DegradedServiceAlert>
          )}
        </section>

        <Block
          id="report"
          eyebrow="Report a run"
          title="From your terminal, or by hand"
          intro={
            <>
              <code className="text-bright">kanehack report</code> wraps the Kane CLI, keeps its exit code and completion event, strips local paths and sends a redacted summary from your paired machine. Those runs can be{" "}
              <span className="text-verified">source-verified</span>. Runs typed in here stay unverified.
            </>
          }
        >
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">1 · Install and pair once</p>
              <CopyField value="curl -fsSL https://kaneclihack.sh/install.sh | sh" />
              <p className="font-plex text-xs text-lightgray">
                Windows: <code>irm https://www.kaneclihack.sh/install.ps1 | iex</code>. Read the{" "}
                <a href="/install.sh" className="underline decoration-hairline underline-offset-4 hover:text-lime">
                  script
                </a>{" "}
                first if you like; it never uses sudo.
              </p>
              <CopyField value="kanehack pair" />
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">2 · Wrap any Kane command</p>
              <CopyField value={'kanehack report -- kane-cli run "Sign up and reach the dashboard" --agent'} />
              <CopyField value="kanehack report --evidence ./pack.zip -- kane-cli testrun run tests/ --agent" />
              <p className="font-plex text-xs text-lightgray">
                Agents can call the <code>kane_record_run</code> MCP tool instead. Exit 2 means nothing ran (auth or setup), not a failed test.
              </p>
            </div>
            <div>
              <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Fallback · log a run by hand</p>
              {me ? <ManualRunForm slug={team.slug} /> : <p className="font-plex text-sm text-lightgray">Viewing read-only.</p>}
            </div>
          </div>
        </Block>

        <Block id="runs" eyebrow="Runs" title={`${o.runs.length} run${o.runs.length === 1 ? "" : "s"}`} intro="Newest first. Open “why” on a card to see exactly what made it verified or not.">
          {runViews.length ? (
            <div className="grid gap-4">
              {runViews.map((r) => (
                <KaneRunCard key={r.id} run={r} now={nowIso} />
              ))}
            </div>
          ) : (
            <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">No runs yet. Pair your machine and wrap your first Kane command with kanehack report.</p>
          )}
        </Block>

        <Block
          id="defects"
          eyebrow="Defects"
          title="What your runs detected"
          intro="A failing run opens a suspected defect. Only a teammate can confirm it, and only a later passing run on a different commit marks the fix as verified. Infra and auth failures are never product bugs."
        >
          {o.defects.length ? (
            <ul className="grid gap-4">
              {o.defects.map((d) => {
                const s = DEFECT[d.status];
                return (
                  <li key={d.id} id={`defect-${d.id}`} className="scroll-mt-24 border border-hairline p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                          DF-{d.id} · {d.failure_class}
                          {d.source_run_id ? ` · from KR-${d.source_run_id}` : ""}
                        </p>
                        <p className="mt-1 font-plex text-sm break-words text-bright">{d.title}</p>
                        {d.detail && <p className="mt-1 font-plex text-xs break-words text-lightgray">{d.detail}</p>}
                      </div>
                      <StatusPill tone={s.tone}>{s.label}</StatusPill>
                    </div>
                    <p className="mt-2 font-plex text-xs text-lightgray">{s.help}</p>
                    {d.verifications.length > 0 && (
                      <ul className="mt-2 space-y-1 font-plex text-xs text-lightgray">
                        {d.verifications.slice(0, 5).map((v) => (
                          <li key={v.run_id}>
                            <a href={`#run-${v.run_id}`} className="underline decoration-hairline underline-offset-4 hover:text-lime">
                              KR-{v.run_id}
                            </a>{" "}
                            on {v.commit_sha?.slice(0, 7) ?? "no SHA"}: {v.result}
                          </li>
                        ))}
                      </ul>
                    )}
                    {me && d.status !== "reverified" && (
                      <div className="mt-3">
                        <DefectButtons slug={team.slug} defectId={d.id} status={d.status} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">No defects detected yet.</p>
          )}
        </Block>

        <Block
          id="milestones"
          eyebrow="Milestones"
          title="Claims, with their evidence"
          intro="Team-only milestones appear right away. Anything for judges or the public needs a teammate’s approval, and shows as UNVERIFIED unless a verified run backs it."
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div>
              {o.milestones.length ? (
                <ul className="grid gap-4">
                  {o.milestones.map((m) => (
                    <li key={m.id} id={`milestone-${m.id}`} className="scroll-mt-24 border border-hairline p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                            MS-{m.id} · visible to {m.visibility}
                            {m.status === "proposed" ? ` · asking for ${m.requested_visibility}` : ""}
                          </p>
                          <p className="mt-1 font-display text-lg text-bright">{m.title}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill tone={MS_TONE[m.confidence]}>{MS_WORD[m.confidence]}</StatusPill>
                          {m.status === "proposed" && <StatusPill tone="pending">Awaiting teammate</StatusPill>}
                        </div>
                      </div>
                      <p className="mt-2 font-plex text-sm text-lightgray">{m.claim}</p>
                      <p className="mt-2 font-plex text-xs text-lightgray">
                        {m.source_run_id && (
                          <a href={`#run-${m.source_run_id}`} className="mr-3 underline decoration-hairline underline-offset-4 hover:text-lime">
                            KR-{m.source_run_id}
                          </a>
                        )}
                        {m.evidence_ids.map((e) => (
                          <a key={e} href={`#evidence-${e}`} className="mr-3 underline decoration-hairline underline-offset-4 hover:text-lime">
                            EV-{e}
                          </a>
                        ))}
                        {m.proposed_by_name ? `Proposed by ${m.proposed_by_name.split(" ")[0]}` : ""}
                        {m.approved_by_name ? ` · approved by ${m.approved_by_name.split(" ")[0]}` : ""}
                      </p>
                      {me && m.status === "proposed" && (
                        <div className="mt-3">
                          <MilestoneButtons slug={team.slug} id={m.id} canApprove={solo || m.proposed_by !== me.id} label={`for ${m.requested_visibility}`} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">No milestones yet.</p>
              )}
            </div>
            <div>{me ? <MilestoneForm slug={team.slug} /> : <p className="font-plex text-sm text-lightgray">Viewing read-only.</p>}</div>
          </div>
        </Block>

        <Block id="evidence" eyebrow="Evidence" title="Files behind the claims" intro="Private to your team (and judges, if you choose). Evidence whose hash matches a verified run’s report is marked VERIFIED.">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <EvidenceInspector
              evidence={o.evidence.map((e) => ({ ...e, verified_at: e.verified_at ? new Date(e.verified_at).toISOString() : null, uploaded_at: new Date(e.uploaded_at).toISOString() }))}
              emptyHint="No evidence yet. kanehack report --evidence uploads a pack with your run."
            />
            <div>{me ? <EvidenceUpload projectId={project.id} runs={o.runs.slice(0, 15).map((r) => ({ id: r.id, label: `KR-${r.id} · ${r.status}` }))} /> : null}</div>
          </div>
        </Block>

        <Block id="coverage" eyebrow="Coverage" title="Designed vs proven" intro="From your latest kane-cli cover report. Team-only, never added up across teams.">
          {o.coverage ? (
            <div className="flex flex-wrap items-end gap-8">
              <Stat value={o.coverage.coverage.designed} label="Designed" />
              <Stat value={o.coverage.coverage.proven} label="Proven" tone={o.coverage.source_verified ? "text-verified" : "text-bright"} />
              <Stat value={o.coverage.coverage.total} label="Criteria" />
              <div className="space-y-2">
                <StatusPill tone={o.coverage.source_verified ? "verified" : "unverified"}>{o.coverage.source_verified ? "Verified report" : "Unverified report"}</StatusPill>
                <FreshnessStamp asOf={new Date(o.coverage.received_at)} now={nowIso} staleAfterSec={6 * 3600} source={`KR-${o.coverage.id}`} />
              </div>
            </div>
          ) : (
            <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">
              No coverage reported. Run <code className="text-bright">kanehack report -- kane-cli cover --mode agent</code> after designing tests.
            </p>
          )}
        </Block>

        <Block id="commits" eyebrow="GitHub" title="Commit timeline" intro="From GitHub push webhooks for the repo in your project. Only commit SHAs and times; no messages or code.">
          {o.commits.length ? (
            <ol className="border-l border-hairline pl-4 font-plex text-xs">
              {o.commits.map((c) => (
                <li key={`${c.repo_full_name}:${c.sha}`} className="py-1.5">
                  <code className="text-bright">{c.sha.slice(0, 7)}</code> <span className="text-lightgray">· {c.repo_full_name}</span>{" "}
                  <FreshnessStamp asOf={new Date(c.pushed_at)} className="ml-1" />
                </li>
              ))}
            </ol>
          ) : (
            <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">
              No pushes received yet. Put your https://github.com/owner/repo link in the project and install the event GitHub App on that repo.
            </p>
          )}
        </Block>
      </div>
    </>
  );
}
