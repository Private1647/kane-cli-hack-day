import type { ReactNode } from "react";
import SmartLink from "./SmartLink";

// Square buttons as on gradium.ai: a solid off-white primary and a hairline
// secondary, both turning lime on hover.
const styles = {
  primary: "bg-bright text-ink hover:bg-lime",
  secondary: "border border-hairline text-bright hover:border-lime hover:text-lime",
  dark: "bg-ink text-bright hover:bg-lime-deep",
};

export default function Button({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof styles;
  className?: string;
  children: ReactNode;
}) {
  const cls = `inline-flex items-center justify-center gap-2 px-4 py-2.5 font-plex text-sm transition-colors ${styles[variant]} ${className}`;
  return (
    <SmartLink href={href} className={cls}>
      {children}
    </SmartLink>
  );
}
