import Link from "next/link";
import type { ReactNode } from "react";

/** True for content hrefs that are still "[placeholders]". */
export const isPlaceholder = (href: string) => href.startsWith("[");

// Links from the content file can be internal routes, external URLs, or
// "[link]" placeholders not filled in yet. Placeholders render as an inert,
// dimmed anchor so missing links are easy to spot on the page.
export default function SmartLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (isPlaceholder(href)) {
    return (
      <a aria-disabled title={`Link to come: ${href}`} className={`cursor-not-allowed opacity-60 ${className}`}>
        {children}
      </a>
    );
  }
  if (/^(https?:|mailto:)/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
