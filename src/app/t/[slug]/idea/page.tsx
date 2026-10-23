import type { Metadata } from "next";
import Link from "next/link";
import Button from "@/components/ui/Button";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent } from "@/lib/event";
import { isEnabled } from "@/lib/flags";
import { PROJECT_TYPES, PROJECT_TYPE_LABEL, getIdea, latestAssessment, listRevisions, type IdeaStatus } from "@/server/ideas";
import { getTeamInfo } from "@/server/teams";
import { Panel } from "@/app/team/blocks";
import Hub, { type HubContext } from "../hub";
import IdeaChecklist, { AdvisoryBanner, VerdictPill } from "./checklist";
import { IdeaForm, SelectIdeaButton, ValidateForm } from "./parts";

export const metadata: Metadata = { title: "Idea" };

// Idea lab (T-IDEA-01..04): the private idea with revisions, the advisory
// validator, and the idea's state up to the freeze at the idea lock.

export default function IdeaTab({ params }: PageProps<"/t/[slug]/idea">) {
  return (
    <Hub params={params} tab="idea">
      {(ctx) => <IdeaLab {...ctx} />}
    </Hub>
  );
}

const STATES: { id: IdeaStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "validated", label: "Validated" },
  { id: "shared", label: "Shared" },
  { id: "selected", label: "Selected" },
  { id: "frozen", label: "Frozen" },
];

async function IdeaLab({ team, me }: HubContext) {
  const [idea, info, event, on] = await Promise.all([getIdea(team.id), getTeamInfo({ id: team.id }), getEvent(), isEnabled("idea")]);
  if (!idea) return null;
  const [latest, revisions] = await Promise.all([latestAssessment(idea.id), listRevisions(idea.id)]);
  // Validation itself adds a revision, so any later revision is an edit the check hasn't seen.
  const stale = !!latest && latest.revision < idea.revision;
  const canEdit = !!me && !idea.locked;
  const captain = !!me && info?.captain_id === me.id;
  const slug = team.slug;

  return (
    <section className="py-10 sm:py-14">
      <div className="container-page space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ol className="flex flex-wrap gap-x-4 gap-y-2 font-plex text-xs" aria-label="Idea state">
            {STATES.map((s) => (
              <li key={s.id} aria-current={s.id === idea.status ? "step" : undefined} className={s.id === idea.status ? "text-lime" : "text-lightgray"}>
                {s.id === idea.status ? "→ " : ""}
                {s.label}
              </li>
            ))}
          </ol>
          {idea.locked ? (
            <StatusPill tone="pending">Frozen at {formatEventTime(idea.idea_lock_at, event)}</StatusPill>
          ) : (
            <span className="font-plex text-xs text-lightgray">Ideas freeze at {formatEventTime(idea.idea_lock_at, event)}</span>
          )}
        </div>

        {!on && (
          <DegradedServiceAlert state="degraded" system="Idea lab" manualRoute={`/t/${slug}/idea/print?blank=1`} manualLabel="Print the paper worksheet">
            The validator and radar are switched off. You can still save your idea; use the paper worksheet for the checklist.
          </DegradedServiceAlert>
        )}

        <div className="grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
          <div className="space-y-8" id="idea-form">
            <Panel title="Your idea" aside={<span className="font-plex text-xs text-lightgray">Revision {idea.revision || "—"}</span>}>
              <IdeaForm
                slug={slug}
                disabled={!canEdit}
                types={PROJECT_TYPES.map((t) => ({ id: t, label: PROJECT_TYPE_LABEL[t] }))}
                defaults={{
                  title: idea.title,
                  private_description: idea.private_description,
                  public_summary: idea.public_summary ?? "",
                  discovery_opt_in: idea.discovery_opt_in,
                  project_type: idea.project_type,
                }}
              />
              {!me && <p className="mt-3 font-plex text-xs text-lightgray">Viewing as organizer: read-only.</p>}
            </Panel>

            {captain && !idea.locked && (idea.status === "validated" || idea.status === "shared") && (
              <Panel title="Lock it in">
                <p className="mb-3 font-plex text-sm text-lightgray">Tell organizers this is what you&apos;re building. You can still edit until the freeze.</p>
                <SelectIdeaButton slug={slug} />
              </Panel>
            )}

            {revisions.length > 0 && (
              <Panel title="Revisions">
                <ol className="border-t border-dashed border-hairline">
                  {revisions.map((r) => (
                    <li key={r.revision} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-hairline py-2 font-plex text-xs text-lightgray">
                      <span>
                        <span className="text-bright">r{r.revision}</span> · {r.title} · {r.actor ?? "—"}
                      </span>
                      <span className="flex items-center gap-2">
                        {r.verdict && <span>checked ({r.generator === "llm" ? "AI" : "rules"})</span>}
                        {formatEventTime(r.created_at, event)}
                      </span>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>

          <div className="space-y-8">
            <Panel title="Idea Validator" aside={<VerdictPill verdict={idea.qualification} />}>
              {latest ? (
                <IdeaChecklist assessment={latest.assessment} stale={stale} />
              ) : (
                <div className="space-y-3">
                  <AdvisoryBanner />
                  <p className="font-plex text-sm text-lightgray">Eight checks against the challenge brief, a verdict, three changes and a Kane path. Save your idea, then validate.</p>
                </div>
              )}
              {me && on && (
                <div className="mt-6 border-t border-dashed border-hairline pt-6">
                  <ValidateForm slug={slug} disabled={false} />
                </div>
              )}
            </Panel>

            <div className="flex flex-wrap gap-3">
              <Button href={`/t/${slug}/idea/radar`} variant="secondary" className="min-h-11">
                Idea Radar
              </Button>
              <Button href={`/t/${slug}/idea/print`} variant="secondary" className="min-h-11">
                Printable checklist
              </Button>
              <Link href={"/team"} className="inline-flex min-h-11 items-center font-plex text-sm text-lightgray underline decoration-hairline underline-offset-4 hover:text-lime">
                Roster & invites
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
