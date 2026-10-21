import { challenge } from "@/data/hackday";
import { Eyebrow, Fold, SectionHeading } from "@/components/ui/Section";
import Statue from "@/components/art/Statue";
import Caption from "@/components/art/Caption";
import Turbofan from "@/components/machines/Turbofan";

// The brief, the three bars every project must clear (as a three-spool
// turbofan), and the tracks as a slow marquee.
export default function Challenge() {
  return (
    <Fold id="challenge">
      <div className="grid items-end gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <SectionHeading eyebrow="The challenge" dim="Build it, test it," bright="Demo it live." intro={challenge.statement} />
        {/* Herakles and the Hydra: cut one head and two grow back, like untested bugs. */}
        <figure className="mx-auto w-56">
          <Statue name="hercules" alt="Herakles fighting the Lernaean Hydra, printed as a halftone" className="mx-auto w-28 lg:w-32" />
          <Caption n={3}>Cut one head off the Hydra and two grow back. Bugs work the same way, unless Kane is watching.</Caption>
        </figure>
      </div>

      {/* The three bars as the three spools of a turbofan: tick the ones your project clears. */}
      <div className="mt-14">
        <p className="mb-8 font-plex text-sm text-lightgray">{challenge.barsIntro} Tick off each one as you clear it.</p>
        <Turbofan className="mx-auto" />
      </div>

      <div className="mt-6 border-t border-dashed border-hairline pt-10">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow>Pick a track</Eyebrow>
          <p className="font-plex text-xs text-lightgray">{challenge.tracksNote}</p>
        </div>
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <ul className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
            {[...challenge.tracks, ...challenge.tracks].map((t, i) => (
              <li
                key={`${t}-${i}`}
                aria-hidden={i >= challenge.tracks.length}
                className="brackets shrink-0 px-6 py-4 font-display text-xl whitespace-nowrap text-bright sm:text-2xl"
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Fold>
  );
}
