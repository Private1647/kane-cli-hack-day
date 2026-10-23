import type { Metadata } from "next";
import Link from "next/link";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import { isEnabled } from "@/lib/flags";
import { getIdea } from "@/server/ideas";
import { Panel, Tag } from "@/app/team/blocks";
import Hub, { type HubContext } from "../../hub";
import { RadarRunner } from "../parts";

export const metadata: Metadata = { title: "Idea Radar" };

// Idea Radar (T-IDEA-05): compares your OPT-IN public summary with other
// teams' opt-in public summaries. Suggestions, never ownership claims;
// private descriptions are never read for this.

export default function RadarTab({ params }: PageProps<"/t/[slug]/idea/radar">) {
  return (
    <Hub params={params} tab="idea">
      {(ctx) => <Radar {...ctx} />}
    </Hub>
  );
}

async function Radar({ team, me }: HubContext) {
  const [idea, on] = await Promise.all([getIdea(team.id), isEnabled("idea")]);
  const shared = !!idea?.discovery_opt_in && !!idea.public_summary;
  return (
    <section className="py-10 sm:py-14">
      <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <aside className="space-y-6">
          <Panel title="How it works">
            <ul className="space-y-2 font-plex text-sm text-lightgray">
              <li>Only teams that chose to share a public summary are compared, yours included.</li>
              <li>Private descriptions are never read, embedded or shown.</li>
              <li>
                Labels are hints: <span className="text-bright">possible overlap</span>, <span className="text-bright">similar angle</span> or{" "}
                <span className="text-bright">complementary</span>. Overlap is allowed; nobody owns an idea.
              </li>
            </ul>
          </Panel>
          <Panel title="Your shared summary" aside={shared ? <Tag className="border-bright text-bright">Shared</Tag> : <Tag>Not shared</Tag>}>
            {shared ? (
              <p className="font-plex text-sm text-bright">“{idea!.public_summary}”</p>
            ) : (
              <p className="font-plex text-sm text-lightgray">
                Turn on sharing and write a public summary on the{" "}
                <Link href={`/t/${team.slug}/idea`} className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  idea tab
                </Link>
                .
              </p>
            )}
          </Panel>
        </aside>
        <div>
          {!on ? (
            <DegradedServiceAlert state="degraded" system="Idea Radar" manualRoute="/help">
              The radar is switched off right now. Ask a mentor if you&apos;re worried about overlap.
            </DegradedServiceAlert>
          ) : me ? (
            <RadarRunner slug={team.slug} canCollaborate />
          ) : (
            <p className="font-plex text-sm text-lightgray">Organizers can review similarity edges in the database; running the radar is for team members.</p>
          )}
        </div>
      </div>
    </section>
  );
}
