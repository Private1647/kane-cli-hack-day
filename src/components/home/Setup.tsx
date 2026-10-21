"use client";

import SmartLink from "@/components/ui/SmartLink";
import { useEffect, useState } from "react";
import { setup, setupDeadline } from "@/data/hackday";
import { Fold, SectionHeading } from "@/components/ui/Section";
import CopyField from "@/components/ui/CopyField";
import Reveal from "@/components/ui/Reveal";
import Statue from "@/components/art/Statue";
import Caption from "@/components/art/Caption";

const STORAGE_KEY = "hackday:setup";
const COUNT_WORDS: Record<number, string> = { 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight" };

// The setup steps as a checklist. Ticks are remembered on this device only.
export default function Setup() {
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      // Reading browser storage has to wait until after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setDone(saved);
    } catch {}
  }, []);

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  return (
    <Fold id="setup">
      <div className="grid items-end gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <SectionHeading
            eyebrow={`Before ${setupDeadline}`}
            dim="Before you build,"
            bright="Do this first."
            intro={`${COUNT_WORDS[setup.length] ?? setup.length} things to sort out before the hackathon begins. Tick them off as you go.`}
          />
          <p className="mt-10 font-dots text-6xl leading-none font-black text-bright" aria-live="polite">
            {done.length}
            <span className="text-lightgray">/{setup.length}</span>
          </p>
        </div>
        {/* Hermes, messenger of the gods, tying his sandal: getting ready to run. */}
        <figure className="mx-auto w-56">
          <Statue name="hermes" alt="Hermes fastening his sandal, printed as a halftone" className="mx-auto w-24 lg:w-28" />
          <Caption n={2}>Hermes ties his sandals before he runs. So should you.</Caption>
        </figure>
      </div>

      <ol className="mt-12 grid gap-px border border-dashed border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
        {setup.map((step, i) => {
          const checked = done.includes(step.id);
          return (
            <Reveal as="li" key={step.id} delay={i * 60} className="flex flex-col gap-4 bg-ink p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="font-pixel text-xs tracking-[0.25em] text-lightgray">{String(i + 1).padStart(2, "0")}</span>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`Mark “${step.title}” done`}
                  onClick={() => toggle(step.id)}
                  className={`grid h-5 w-5 place-items-center border transition-colors ${
                    checked ? "border-lime bg-lime text-ink" : "border-hairline text-transparent hover:border-lime"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6.5l2.5 2.5L10 3.5" />
                  </svg>
                </button>
              </div>
              <h3 className={`font-display text-xl transition-colors ${checked ? "text-lightgray line-through" : "text-bright"}`}>
                {step.title}
              </h3>
              <p className="font-plex text-sm leading-relaxed text-lightgray">{step.body}</p>
              {step.value && <CopyField value={step.value} />}
              {step.link && (
                <SmartLink href={step.link.href} className="mt-auto font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  {step.link.label} →
                </SmartLink>
              )}
            </Reveal>
          );
        })}
      </ol>
    </Fold>
  );
}
