import type { Metadata } from "next";
import { HelpDesk } from "@/app/help/views";
import Help from "@/components/home/Help";
import { query } from "@/lib/db";
import Hub from "../hub";

export const metadata: Metadata = { title: "Help" };

// The team's help desk: open a ticket, follow the team's tickets, and the
// mentors on the floor. Tickets land in the same queue as /help and /ops/help.
export default function HelpTab({ params }: PageProps<"/t/[slug]/help">) {
  return (
    <Hub params={params} tab="help">
      {({ team, me }) => (
        <>
          <section className="py-12 sm:py-16">
            <div className="container-page">
              <TeamHelpDesk teamId={team.id} memberId={me?.id ?? null} />
            </div>
          </section>
          <Help />
        </>
      )}
    </Hub>
  );
}

async function TeamHelpDesk({ teamId, memberId }: { teamId: number; memberId: number | null }) {
  const [t] = await query<{ table_label: string | null }>("select table_label from teams where id = $1", [teamId]).catch(() => []);
  return <HelpDesk memberId={memberId} teamId={teamId} defaultTable={t?.table_label ?? null} canCreate={memberId !== null} />;
}
