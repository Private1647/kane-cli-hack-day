import type { ReactNode } from "react";
import Reveal from "./Reveal";

// One step on a subpage: a sticky meta column (step, big time, tag) beside
// the step's content. Used for submissions and evaluations.
export default function StepBlock({
  id,
  kicker,
  time,
  tag,
  title,
  children,
}: {
  id: string;
  kicker: string;
  time: string;
  tag?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-dashed border-hairline py-16 sm:py-20">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-pixel text-xs uppercase tracking-[0.25em] text-lightgray">{kicker}</p>
          <p className="mt-4 font-dots text-6xl leading-none font-black text-bright sm:text-7xl">{time}</p>
          {tag && (
            <span className="mt-4 inline-block border border-lime px-1.5 py-0.5 font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">
              {tag}
            </span>
          )}
        </div>
        <Reveal>
          <h2 className="font-display text-3xl text-bright sm:text-4xl">{title}</h2>
          <div className="mt-6 space-y-6 font-plex text-sm leading-relaxed text-lightgray md:text-base">{children}</div>
        </Reveal>
      </div>
    </section>
  );
}

/** A dashed checklist of things to have ready. */
export function Checklist({ items, label }: { items: string[]; label?: string }) {
  return (
    <div>
      {label && <p className="mb-3 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</p>}
      <ul className="border-t border-dashed border-hairline">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-3 border-b border-dashed border-hairline py-3 text-bright">
            <span aria-hidden className="h-2 w-2 bg-lime" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
