"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

type Item = { href: string; label: string };

// The /ops section row. Scrolls sideways on phones rather than wrapping.
export default function OpsNav({ items }: { items: Item[] }) {
  return (
    <nav aria-label="Ops" className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => (
          <li key={i.href}>
            <Suspense fallback={<NavLink {...i} active={false} />}>
              <ActiveNavLink {...i} />
            </Suspense>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ActiveNavLink(i: Item) {
  const path = usePathname();
  const active = i.href === "/ops" ? path === "/ops" : path === i.href || path.startsWith(`${i.href}/`);
  return <NavLink {...i} active={active} />;
}

function NavLink({ href, label, active }: Item & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center border-b-2 px-3 font-plex text-sm transition-colors ${
        active ? "border-lime text-lime" : "border-transparent text-lightgray hover:text-bright"
      }`}
    >
      {label}
    </Link>
  );
}
