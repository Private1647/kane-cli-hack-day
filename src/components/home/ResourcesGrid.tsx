import Link from "next/link";
import { resources } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";

// One bracketed tile per resource group, each opening its part of /resources.
export default function ResourcesGrid() {
  return (
    <Fold id="resources">
      <SectionHeading
        eyebrow="Resources"
        dim="Everything you need,"
        bright="While you build."
        intro="Docs, starter repos, build ideas and a prompt pack for content hour."
      />
      <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((g, i) => (
          <Reveal as="li" key={g.id} delay={(i % 3) * 70}>
            <Link
              href={`/resources#${g.id}`}
              className="brackets group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-surface"
            >
              <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
                {String(i + 1).padStart(2, "0")} · {g.items.length} items
              </span>
              <h3 className="font-display text-2xl text-bright">{g.title}</h3>
              <p className="font-plex text-sm leading-relaxed text-lightgray">{g.blurb}</p>
              <span className="mt-auto pt-4 font-plex text-sm text-bright group-hover:text-lime">Open →</span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </Fold>
  );
}
