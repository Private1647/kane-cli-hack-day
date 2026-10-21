import SmartLink from "@/components/ui/SmartLink";
import { rules } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";

// Heading on the left, rules as an accordion on the right — Phonon's FAQ layout.
export default function Rules() {
  return (
    <Fold id="rules">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SectionHeading eyebrow="Rules" dim="The rules," bright="No surprises." intro="Break one and you can’t place. Ask at the help desk if anything is unclear." />
        <div className="border-t border-dashed border-hairline">
          {rules.map((r, i) => (
            <details key={r.title} className="group border-b border-dashed border-hairline" open={i < 3}>
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 font-display text-lg text-bright">
                {r.title}
                <span aria-hidden className="font-plex text-sm text-lightgray transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 font-plex text-sm leading-relaxed text-lightgray">
                {r.body}{" "}
                {r.link && (
                  <SmartLink href={r.link.href} className="text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                    {r.link.label} →
                  </SmartLink>
                )}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Fold>
  );
}
