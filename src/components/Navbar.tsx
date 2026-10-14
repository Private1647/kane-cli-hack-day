"use client";

import { useState } from "react";
import { hackathon } from "@/data/hackathon";

const links = [
  { href: "#about", label: "About" },
  { href: "#tracks", label: "Tracks" },
  { href: "#schedule", label: "Schedule" },
  { href: "#prizes", label: "Prizes" },
  { href: "#faq", label: "FAQ" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500" />
          {hackathon.name}
        </a>

        <ul className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href={hackathon.registerUrl}
          className="hidden rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 md:inline-block"
        >
          Register
        </a>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-zinc-300 hover:bg-white/10 md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/10 px-4 pb-4 md:hidden">
          <ul className="flex flex-col gap-3 py-3 text-zinc-300">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block py-1">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={hackathon.registerUrl}
            onClick={() => setOpen(false)}
            className="block rounded-full bg-white px-4 py-2 text-center text-sm font-medium text-zinc-900"
          >
            Register
          </a>
        </div>
      )}
    </header>
  );
}
