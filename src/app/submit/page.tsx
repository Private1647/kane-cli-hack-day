import type { Metadata } from "next";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import StepBlock, { Checklist } from "@/components/ui/StepBlock";
import { submissions } from "@/data/hackday";
import { to12h } from "@/lib/time";
import Afterburner from "@/components/machines/Afterburner";

export const metadata: Metadata = { title: "Submit" };

export default function SubmitPage() {
  const { team, idea, final } = submissions;
  return (
    <main>
      <PageHeader
        eyebrow="Submit"
        dim="Three deadlines,"
        bright="One Devpost."
        intro="Register your team, lock your idea, then submit your project. Each step has a hard deadline."
        jumps={[
          { href: "#team", label: `Team · ${to12h(team.deadline)}` },
          { href: "#idea", label: `Idea · ${to12h(idea.deadline)}` },
          { href: "#final", label: `Project · ${to12h(final.deadline)}` },
        ]}
      />

      <StepBlock id="team" kicker="Step 1 · Team registration" time={to12h(team.deadline)} tag="Closes" title="Register your team">
        <Checklist label="You’ll need" items={team.needs} />
        <p>{team.solo}</p>
        <Button href={team.form.href}>{team.form.label} →</Button>
      </StepBlock>

      <StepBlock id="idea" kicker="Step 2 · Idea submission" time={to12h(idea.deadline)} tag="Locks" title="Create your Devpost project">
        <Checklist label="Add" items={idea.needs} />
        <p>{idea.note}</p>
        <Button href={idea.devpost.href}>{idea.devpost.label} →</Button>
      </StepBlock>

      <StepBlock id="final" kicker="Step 3 · Final submission" time={to12h(final.deadline)} tag="Locks" title="Submit your project">
        <p>All three essentials, plus at least two content pieces. Tick them off as you ship.</p>
        {/* The bundle checklist as an engine: every piece adds thrust, all four content pieces light the afterburner. */}
        <Afterburner />

        <p className="border-l-2 border-lime pl-4 text-bright">{final.closing}</p>
        <div className="flex flex-wrap gap-3">
          <Button href={final.devpost.href}>{final.devpost.label} →</Button>
          <Button href="/content-hour" variant="secondary">
            Content hour plan
          </Button>
        </div>
      </StepBlock>
    </main>
  );
}
