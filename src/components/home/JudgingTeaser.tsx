import Button from "@/components/ui/Button";
import { Fold, SectionHeading } from "@/components/ui/Section";
import ThemisScale from "@/components/machines/ThemisScale";
import { judging } from "@/data/hackday";

// How projects are scored: the 100-point rubric weighed on the scale of Themis,
// with the stage format alongside. The plain rubric bars live on /judging.
export default function JudgingTeaser() {
  return (
    <Fold id="judging">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <SectionHeading eyebrow="Judging" dim="100 points," bright="Kane counts most." intro={judging.shortlist} />
          <dl className="mt-8 grid grid-cols-2 gap-px border border-dashed border-hairline bg-hairline">
            <div className="bg-ink p-4">
              <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">On stage</dt>
              <dd className="mt-2 font-display text-lg text-bright">{judging.stage.demo}</dd>
            </div>
            <div className="bg-ink p-4">
              <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Then</dt>
              <dd className="mt-2 font-display text-lg text-bright">{judging.stage.qa}</dd>
            </div>
          </dl>
          <Button href="/judging" variant="secondary" className="mt-8">
            How evaluation works →
          </Button>
        </div>
        <ThemisScale className="mx-auto" />
      </div>
    </Fold>
  );
}
