import type { ReactNode } from "react";
import Decode from "./Decode";
import Reveal from "./Reveal";

// Gradium-style section heading: a pixel eyebrow over a two-line dot-matrix
// title whose first line is dim and second bright, plus optional intro copy.
export function SectionHeading({
  eyebrow,
  dim,
  bright,
  intro,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  dim: string;
  bright: string;
  intro?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const center = align === "center";
  return (
    <Reveal className={`${center ? "mx-auto text-center" : ""} max-w-3xl ${className}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 font-dots text-[2rem] leading-[0.95] font-black tracking-[-0.01em] sm:text-[2.75rem] lg:text-[3.5rem]">
        <span className="block text-lightgray">{dim}</span>
        <Decode text={bright} className="block text-bright" />
      </h2>
      {intro && (
        <div className={`mt-5 max-w-xl font-plex text-sm leading-relaxed text-lightgray md:text-base ${center ? "mx-auto" : ""}`}>
          {intro}
        </div>
      )}
    </Reveal>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-pixel text-xs uppercase tracking-[0.25em] text-lightgray ${className}`}>{children}</p>
  );
}

// A full-width fold with a dashed hairline on top, like Phonon's sections.
export function Fold({
  id,
  className = "",
  children,
  light = false,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  /** Light background fold, used once or twice for rhythm (as gradium.ai does). */
  light?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-t border-dashed py-20 sm:py-28 ${
        // A light fold inverts the palette tokens so children need no variants.
        light
          ? "border-transparent bg-[#f2f2f2] text-[#0a0a0a] [--bright:#0a0a0a] [--hairline:#c4c4c4] [--ink:#f2f2f2] [--lightgray:#5c5c5c] [--surface:#e8e8e8]"
          : "border-hairline"
      } ${className}`}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}
