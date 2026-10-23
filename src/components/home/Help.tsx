import Image from "next/image";
import { mentors } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";

// The heading beside the mentors attendees can find on the floor.
export default function Help() {
  return (
    <Fold id="help">
      <div className="grid gap-16 lg:grid-cols-2 [&>*]:min-w-0">
        <SectionHeading eyebrow="Help" dim="Stuck?" bright="We’re on the floor." />
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Reach out to mentors</p>
          <ul className="mt-3 border-t border-dashed border-hairline">
            {mentors.map((m) => (
              <li key={m.name} className="group flex items-center gap-4 border-b border-dashed border-hairline py-4">
                {/* Monochrome like the judges; colour on hover. */}
                <Image
                  src={m.photo}
                  alt={m.name}
                  width={256}
                  height={256}
                  sizes="56px"
                  className="h-14 w-14 shrink-0 object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base text-bright">{m.name}</p>
                  <p className="font-plex text-xs text-lightgray">{m.role}</p>
                </div>
                <p className="flex shrink-0 gap-3 font-pixel text-[10px] uppercase tracking-[0.2em]">
                  {m.linkedin && (
                    <a href={m.linkedin} target="_blank" rel="noreferrer" aria-label={`${m.name} on LinkedIn`} className="text-bright transition-colors hover:text-lime">
                      LinkedIn ↗
                    </a>
                  )}
                  {m.x && (
                    <a href={m.x} target="_blank" rel="noreferrer" aria-label={`${m.name} on X`} className="text-bright transition-colors hover:text-lime">
                      X ↗
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Fold>
  );
}
