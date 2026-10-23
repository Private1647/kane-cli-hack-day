import type { Metadata } from "next";
import Setup from "@/components/hub/Setup";
import { getSetupTicks } from "@/lib/teams";
import { toggleSetup } from "../actions";
import Hub, { type HubContext } from "../hub";

export const metadata: Metadata = { title: "Setup" };

export default function SetupTab({ params }: PageProps<"/t/[slug]/setup">) {
  return (
    <Hub params={params} tab="setup">
      {(ctx) => <SetupForMember {...ctx} />}
    </Hub>
  );
}

async function SetupForMember({ team, me }: HubContext) {
  const done = me ? await getSetupTicks(me.id) : [];
  return <Setup initialDone={done} onToggle={me ? toggleSetup.bind(null, team.slug) : undefined} />;
}
