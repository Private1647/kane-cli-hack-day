import { prizes } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Statue from "@/components/art/Statue";
import Caption from "@/components/art/Caption";

// Light fold for contrast (as gradium.ai's "Infrastructure" band): the podium
// as three columns, then the shipped prize and the everyone prize as cards.
export default function Prizes() {
  return (
    <Fold id="prizes" light>
      <div className="grid items-end gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <SectionHeading eyebrow="Prizes" dim="Three on the podium," bright="Something for all." intro={prizes.podiumNote} />
        {/* The Discobolus: an Olympic athlete mid-throw, on the light fold in dark ink. */}
        <figure className="mx-auto w-56">
          <Statue name="discobolus" ink="#141414" alt="The Discobolus, an athlete throwing a discus, printed as a halftone" className="mx-auto w-32 lg:w-36" />
          <Caption n={4}>Myron’s discus thrower: winners were crowned with olive, yours get hardware.</Caption>
        </figure>
      </div>

      <div className="mt-14 grid border-t border-dashed border-hairline sm:grid-cols-3">
        {prizes.podium.map((p, i) => (
          <Reveal
            key={p.place}
            delay={i * 90}
            className="border-b border-dashed border-hairline py-8 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0"
          >
            <p className="font-dots text-7xl leading-none font-black text-bright sm:text-8xl">{p.place}</p>
            <p className="mt-6 font-display text-2xl text-bright">{p.prize}</p>
            <p className="mt-1 font-plex text-sm text-lightgray">+ {p.credits}</p>
          </Reveal>
        ))}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Reveal className="bg-lime p-8 text-[#0a0a0a]">
          <p className="font-pixel text-xs uppercase tracking-[0.25em]">{prizes.shipped.title}</p>
          <p className="mt-6 font-display text-3xl">{prizes.shipped.prize}</p>
          <p className="mt-2 font-plex text-sm">{prizes.shipped.rule}</p>
        </Reveal>
        <Reveal delay={90} className="bg-[#0a0a0a] p-8 text-[#f2f2f2]">
          <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[#9a9a9a]">{prizes.everyone.title}</p>
          <p className="mt-6 font-display text-3xl">{prizes.everyone.prize}</p>
          <p className="mt-2 font-plex text-sm text-[#9a9a9a]">Just for building with us.</p>
        </Reveal>
      </div>
    </Fold>
  );
}
