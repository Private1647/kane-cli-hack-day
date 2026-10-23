import Link from "next/link";
import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/Section";
import { contentHour } from "@/data/hackday";

const START = 17 * 60; // 5:00 pm

const clock = (mins: number) => `${Math.floor(mins / 60) % 12 || 12}:${String(mins % 60).padStart(2, "0")}`;

// Each step's start and end on the clock, laid end to end from 5:00.
const steps = contentHour.steps.map((s, i) => {
  const from = START + contentHour.steps.slice(0, i).reduce((n, p) => n + p.minutes, 0);
  return { ...s, from, to: from + s.minutes };
});
const total = steps.reduce((n, s) => n + s.minutes, 0);

// The last hour as a timed run of steps, laid end to end from 5:00.
export default function ContentHourBody() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading eyebrow="Content hour" dim="5:00 to 6:00," bright="Ship and tell people." intro={contentHour.intro} />
        {/* The hour as one bar, split by step length. */}
        <div className="mt-12 flex h-3 gap-px" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.title} className={i % 2 ? "bg-[#5a6b1f]" : "bg-lime"} style={{ flex: s.minutes }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-plex text-xs text-lightgray">
          <span>{clock(START)}</span>
          <span>
            {total} min · Devpost locks {clock(START + 60)}
          </span>
        </div>

        <ol className="mt-12 border-t border-dashed border-hairline">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 60}>
              <Link
                href={s.href}
                className="group grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-dashed border-hairline py-6 transition-colors hover:bg-surface sm:grid-cols-[7rem_minmax(0,1fr)_8rem_auto]"
              >
                <span className="font-dots text-4xl leading-none font-black text-lime">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-xl text-bright sm:text-2xl">{s.title}</span>
                <span className="hidden font-plex text-sm text-lightgray tabular-nums sm:block">
                  {clock(s.from)}–{clock(s.to)}
                </span>
                <span className="font-plex text-sm text-bright group-hover:text-lime">{s.minutes} min →</span>
              </Link>
            </Reveal>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button href="/resources#content-skills">Get the prompt pack</Button>
          <Button href="/submit#final" variant="secondary">
            Final submission checklist
          </Button>
        </div>
      </div>
    </section>
  );
}
