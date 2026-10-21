import { event, help, share } from "@/data/hackday";
import Button from "@/components/ui/Button";
import CopyField from "@/components/ui/CopyField";
import { Eyebrow, Fold, SectionHeading } from "@/components/ui/Section";

// Two halves: where to get help on the floor, and how to post that you're here.
export default function HelpShare() {
  return (
    <Fold id="help">
      <div className="grid gap-16 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <SectionHeading eyebrow="Help" dim="Stuck?" bright="We’re on the floor." />
          <dl className="mt-10 border-t border-dashed border-hairline">
            {help.map((h) => (
              <div key={h.title} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-4 border-b border-dashed border-hairline py-4">
                <dt className="font-plex text-sm text-lightgray">{h.title}</dt>
                <dd className="font-plex text-sm text-bright">{h.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div id="share" className="scroll-mt-24">
          <SectionHeading eyebrow="Share" dim="Tell people" bright="You’re here." />
          {/* Placeholder preview of the social card until the real asset lands. */}
          <div className="brackets mt-10 grid aspect-[1200/630] place-items-center bg-surface p-6 text-center">
            <div className="w-full min-w-0">
              <Eyebrow>I’m building at</Eyebrow>
              <p className="mt-3 font-dots text-2xl leading-none font-black break-words text-bright sm:text-4xl">
                {event.name} {event.city}
              </p>
              <p className="mt-4 font-plex text-xs break-words text-lightgray">{share.tags.join("  ")}</p>
            </div>
          </div>
          <CopyField value={`${share.caption} ${share.tags.join(" ")}`} className="mt-4" />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button href={share.card.href}>Download card</Button>
            <p className="font-plex text-xs text-lightgray">{share.shippedCard}</p>
          </div>
        </div>
      </div>
    </Fold>
  );
}
