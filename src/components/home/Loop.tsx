import SmartLink from "@/components/ui/SmartLink";
import { loop } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import AssuranceFigure from "./AssuranceFigure";

// The seven Kane CLI assurance stages, from testmuai.com/assurance-loop.
const STAGES = ["Capture", "Extract", "Review", "Design", "Execute", "Measure", "Maintain"];

export default function Loop() {
  return (
    <Fold id="loop" className="bg-surface">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div>
          <SectionHeading eyebrow="The Assurance loop" dim="From requirement" bright="to proof." intro={loop.summary} />
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {loop.links.map((l) => (
              <li key={l.label}>
                <SmartLink href={l.href} className="font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  {l.label} →
                </SmartLink>
              </li>
            ))}
          </ul>
        </div>
        <AssuranceFigure />
      </div>

      <ol className="mt-16 grid grid-cols-2 gap-px border border-dashed border-hairline bg-hairline sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s, i) => (
          <li key={s} className="bg-surface px-4 py-3 last:col-span-2 lg:last:col-span-1">
            <span className="font-pixel text-[10px] tracking-[0.2em] text-lightgray">{i + 1}/7</span>
            <span className="mt-1 block font-plex text-sm text-bright">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-plex text-xs text-lightgray">
        Every stage is a command you can stop and review. Today you’ll mostly live in Execute: run, read the evidence, fix.
      </p>
    </Fold>
  );
}
