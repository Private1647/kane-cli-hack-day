import { prizes } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Statue from "@/components/art/Statue";
import Caption from "@/components/art/Caption";
import { artworks } from "@/data/art";

// "$3,000 OpenAI credits" → "$3,000" and "OpenAI credits".
const creditAmount = (c: string) => c.split(" ")[0];
const creditLabel = (c: string) => c.split(" ").slice(1).join(" ");

// Widths that give each prize image roughly the same visual height.
const PRIZE_WIDTH = { visionpro: "w-52", macmini: "w-56", ipad: "w-28" } as const;

// Light fold for contrast (as gradium.ai's "Infrastructure" band): the podium
// as three columns, then the shipped prize and the everyone prize as cards.
export default function Prizes() {
  return (
    <Fold id="prizes" light>
      <div className="grid items-end gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <SectionHeading eyebrow="Prizes" dim="Three on the podium," bright="Something for all." intro={prizes.podiumNote} />
        {/* The Discobolus: an Olympic athlete mid-throw, on the light fold in dark ink. */}
        <figure className="mx-auto w-56">
          <Statue name="discobolus" ink="#141414" paper="#f2f2f2" alt="The Discobolus, an athlete throwing a discus, printed as a halftone" className="mx-auto w-32 lg:w-36" />
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
            {/* The prize as a halftone print, with the same lime lens on hover. */}
            <div className="mb-6 flex h-40 items-end">
              <Statue name={p.art} ink="#141414" paper="#f2f2f2" alt={`${p.prize}, printed as a halftone`} className={PRIZE_WIDTH[p.art]} />
            </div>
            <PhotoCredit art={p.art} />
            <p className="font-dots text-7xl leading-none font-black text-bright sm:text-8xl">{p.place}</p>
            <p className="mt-6 font-display text-2xl text-bright">{p.prize}</p>
            {/* The OpenAI credits get equal billing with the hardware. */}
            <p className="mt-4 inline-flex items-baseline gap-2 bg-lime px-3 py-2 text-[#0a0a0a]">
              <span className="font-dots text-3xl leading-none font-black sm:text-4xl">+{creditAmount(p.credits)}</span>
              <span className="font-plex text-sm">{creditLabel(p.credits)}</span>
            </p>
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

// The licence-required photo credit, kept small under the prize image.
function PhotoCredit({ art }: { art: (typeof prizes.podium)[number]["art"] }) {
  const a = artworks.find((w) => w.prize === art);
  if (!a) return null;
  return (
    <p className="-mt-4 mb-6 font-plex text-[10px] text-lightgray">
      <a href={a.href} target="_blank" rel="noreferrer" className="hover:text-[#141414]">
        {a.credit}, {a.license}
      </a>
    </p>
  );
}
