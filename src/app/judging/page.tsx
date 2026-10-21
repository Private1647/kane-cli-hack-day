import type { Metadata } from "next";
import Rubric from "@/components/judging/Rubric";
import PageHeader from "@/components/ui/PageHeader";
import { Fold, SectionHeading } from "@/components/ui/Section";
import StepBlock, { Checklist } from "@/components/ui/StepBlock";
import { evaluations, judging } from "@/data/hackday";

export const metadata: Metadata = { title: "Judging" };

export default function JudgingPage() {
  const { mid, final } = evaluations;
  return (
    <main>
      <PageHeader
        eyebrow="Judging"
        dim="Two rounds at your table,"
        bright="One on stage."
        intro="Mentors give feedback at 2:00, judges score at 4:00, and the top 7 demo on stage at 6:00."
        jumps={[
          { href: "#mid", label: "Mid evaluation" },
          { href: "#final", label: "Final evaluation" },
          { href: "#rubric", label: "Rubric" },
          { href: "#stage", label: "Stage demos" },
          { href: "#judges", label: "Judges" },
        ]}
      />

      <StepBlock id="mid" kicker="Round 1 · Feedback only" time={mid.time} tag="Not scored" title={mid.title}>
        <p>{mid.body}</p>
        <Checklist label="Mentors check for" items={mid.checks} />
      </StepBlock>

      <StepBlock id="final" kicker="Round 2 · Scored" time={final.time} tag="Scored" title={final.title}>
        <p>{final.body}</p>
        <Checklist items={final.checks} />
      </StepBlock>

      <Fold id="rubric">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <SectionHeading eyebrow="Rubric" dim="Same rubric," bright="Every track." intro="Kane CLI usage carries the most weight." />
          <Rubric />
        </div>
      </Fold>

      <Fold id="stage">
        <SectionHeading eyebrow="Stage · 6:00 – 7:00" dim="Top 7," bright="Five minutes each." intro={judging.shortlist} />
        <div className="mt-12 grid gap-px border border-dashed border-hairline bg-hairline sm:grid-cols-2">
          <div className="bg-ink p-8">
            <p className="font-dots text-6xl leading-none font-black text-lime">3:00</p>
            <p className="mt-4 font-display text-xl text-bright">{judging.stage.demo}</p>
            <p className="mt-2 font-plex text-sm text-lightgray">Lead with the run report, show one real flow, end on what Kane caught.</p>
          </div>
          <div className="bg-ink p-8">
            <p className="font-dots text-6xl leading-none font-black text-bright">2:00</p>
            <p className="mt-4 font-display text-xl text-bright">{judging.stage.qa}</p>
            <p className="mt-2 font-plex text-sm text-lightgray">{judging.shippedNote}</p>
          </div>
        </div>
      </Fold>

      <Fold id="judges">
        <SectionHeading eyebrow="Judges" dim="Who’s" bright="Scoring." />
        <ul className="mt-12 grid grid-cols-2 gap-6 md:grid-cols-4">
          {judging.judges.map((j, i) => (
            <li key={i} className="brackets p-4">
              {/* Placeholder portrait until real photos are added. */}
              <div className="aspect-square bg-surface [background-image:radial-gradient(#2a2a2a_1px,transparent_1.5px)] [background-size:8px_8px]" />
              <p className="mt-4 font-display text-lg text-bright">{j}</p>
              <p className="font-plex text-xs text-lightgray">[role, company]</p>
            </li>
          ))}
        </ul>
      </Fold>
    </main>
  );
}
