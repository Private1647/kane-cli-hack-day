import SmartLink from "@/components/ui/SmartLink";
import { loop } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import AssuranceLoop from "./AssuranceLoop";

// The seven Kane CLI assurance stages, from testmuai.com/assurance-loop.
const STAGES = ["Capture", "Extract", "Review", "Design", "Execute", "Measure", "Maintain"];

export default function Loop() {
  return (
    <Fold id="loop" className="bg-surface">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <SectionHeading eyebrow="The Assurance loop" dim="Codex builds," bright="Kane proves it." intro={loop.summary} />
        <div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:justify-end">
            {loop.links.map((l) => (
              <li key={l.label}>
                <SmartLink href={l.href} className="font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  {l.label} →
                </SmartLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AssuranceLoop className="mt-14" />

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
