"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ctas, event } from "@/data/hackday";

const links = [
  { href: "/#schedule", label: "Schedule" },
  { href: "/#challenge", label: "Challenge" },
  { href: "/#prizes", label: "Prizes" },
  { href: "/submit", label: "Submit" },
  { href: "/judging", label: "Judging" },
  { href: "/resources", label: "Resources" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = (href: string) => !href.startsWith("/#") && pathname.startsWith(href);

  return (
    <header id="nav-bar" className="sticky top-0 z-50 border-b border-hairline bg-ink/85 backdrop-blur">
      <nav className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
          <img src="/logos/kane-ascii-nav.png" alt="" width={96} height={93} className="h-9 w-auto" />
          <span className="font-pixel text-xs uppercase tracking-[0.18em] text-bright">{event.name}</span>
        </Link>

        <ul className="hidden items-center gap-6 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`font-plex text-sm transition-colors hover:text-lime ${active(l.href) ? "text-lime" : "text-bright"}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-4 lg:flex">
          <Link href={ctas.helpDesk.href} className="font-plex text-sm text-bright transition-colors hover:text-lime">
            Help
          </Link>
          <Link
            href={ctas.submitProject.href}
            className="bg-bright px-3 py-1.5 font-plex text-sm text-ink transition-colors hover:bg-lime"
          >
            {ctas.submitProject.label}
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="p-2 text-bright lg:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-dashed border-hairline lg:hidden">
          <ul className="container-page flex flex-col py-3">
            {[...links, { href: ctas.helpDesk.href, label: "Help" }].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-dashed border-hairline py-3 font-plex text-sm text-bright"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="container-page pb-4">
            <Link
              href={ctas.submitProject.href}
              onClick={() => setOpen(false)}
              className="block bg-bright py-2.5 text-center font-plex text-sm text-ink"
            >
              {ctas.submitProject.label}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
