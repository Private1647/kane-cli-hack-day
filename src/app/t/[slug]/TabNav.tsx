"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HUB_TABS, hubPath } from "@/lib/hub";

// The hub's tab row. Scrolls sideways on narrow screens rather than wrapping.
export default function TabNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Team hub" className="mt-8 -mb-px overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {HUB_TABS.map((t) => {
          const href = hubPath(slug, t.id);
          const active = pathname === href;
          return (
            <li key={t.id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-3 py-3 font-plex text-sm transition-colors ${
                  active ? "border-lime text-lime" : "border-transparent text-lightgray hover:text-bright"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
