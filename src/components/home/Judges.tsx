import Image from "next/image";
import { judging } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";

// Who's scoring. Public on the home page, and repeated in the hub's Judging tab.
export default function Judges() {
  return (
    <Fold id="judges">
      <SectionHeading eyebrow="Judges" dim="Who’s" bright="Scoring." />
      <ul className="mt-12 grid max-w-2xl grid-cols-2 gap-6">
        {judging.judges.map((j, i) => (
          <li key={i} className="group brackets p-4">
            {j.photo ? (
              // Monochrome to sit with the rest of the page; colour comes back on hover.
              <Image
                src={j.photo}
                alt={j.name}
                width={640}
                height={640}
                sizes="(min-width: 768px) 25vw, 50vw"
                className="aspect-square w-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0"
              />
            ) : (
              // Placeholder portrait until a real photo is added.
              <div className="aspect-square bg-surface [background-image:radial-gradient(#2a2a2a_1px,transparent_1.5px)] [background-size:8px_8px]" />
            )}
            <p className="mt-4 font-display text-lg text-bright">{j.name}</p>
            <p className="font-plex text-xs text-lightgray">{j.role}</p>
            {(j.linkedin || j.x) && (
              <p className="mt-3 flex gap-4 font-pixel text-[10px] uppercase tracking-[0.2em]">
                {j.linkedin && (
                  <a href={j.linkedin} target="_blank" rel="noreferrer" aria-label={`${j.name} on LinkedIn`} className="text-bright transition-colors hover:text-lime">
                    LinkedIn ↗
                  </a>
                )}
                {j.x && (
                  <a href={j.x} target="_blank" rel="noreferrer" aria-label={`${j.name} on X`} className="text-bright transition-colors hover:text-lime">
                    X ↗
                  </a>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Fold>
  );
}
