import Link from "next/link";
import type { ReactNode } from "react";
import Decode from "./Decode";
import { Eyebrow } from "./Section";

// Top of every subpage: breadcrumb eyebrow, two-tone dot-matrix title, intro,
// and jump links to the sections below.
export default function PageHeader({
  eyebrow,
  dim,
  bright,
  intro,
  jumps = [],
}: {
  eyebrow: string;
  dim: string;
  bright: string;
  intro?: ReactNode;
  jumps?: { href: string; label: string }[];
}) {
  return (
    <header className="border-b border-dashed border-hairline pt-16 pb-12 sm:pt-24">
      <div className="container-page">
        <Eyebrow>
          <Link href="/" className="hover:text-bright">
            Hack Day
          </Link>{" "}
          / {eyebrow}
        </Eyebrow>
        <h1 className="mt-4 font-dots text-[2.5rem] leading-[0.95] font-black sm:text-[3.5rem] lg:text-[4.5rem]">
          <span className="block text-lightgray">{dim}</span>
          <Decode text={bright} className="block text-bright" />
        </h1>
        {intro && <div className="mt-6 max-w-2xl font-plex text-sm leading-relaxed text-lightgray md:text-base">{intro}</div>}
        {jumps.length > 0 && (
          <nav aria-label="On this page" className="mt-10 flex flex-wrap gap-2">
            {jumps.map((j) => (
              <a
                key={j.href}
                href={j.href}
                className="border border-hairline px-3 py-1.5 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime"
              >
                {j.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
