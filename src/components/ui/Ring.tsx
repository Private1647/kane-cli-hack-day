import type { ReactNode } from "react";

// The orbital big number (Mission Control): a Doto numeral inside a hairline
// ring, with an optional arc for value / denominator. One primary count per
// view. Pass `tone="verified"` only for evidence-backed counts.

const ARC: Record<"verified" | "accent" | "neutral" | "pending", string> = {
  verified: "var(--verified)",
  accent: "var(--lime)",
  neutral: "var(--bright)",
  pending: "var(--warning)",
};

export default function Ring({
  value,
  denominator,
  label,
  tone = "neutral",
  size = 280,
  footer,
  className = "",
}: {
  /** null = unknown: shows an em dash, never 0. */
  value: number | null;
  denominator?: number | null;
  label: string;
  tone?: keyof typeof ARC;
  size?: number;
  footer?: ReactNode;
  className?: string;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const frac = value != null && denominator ? Math.max(0, Math.min(1, value / denominator)) : null;
  const shown = value == null ? "—" : value.toLocaleString("en-US");
  return (
    <figure className={`inline-flex flex-col items-center gap-3 ${className}`}>
      <div className="relative" style={{ width: size, height: size, maxWidth: "100%" }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hairline)" strokeWidth="0.6" />
          <circle cx="50" cy="50" r={r - 4} fill="none" stroke="var(--hairline)" strokeWidth="0.3" strokeDasharray="0.6 2" />
          {frac != null && (
            <circle cx="50" cy="50" r={r} fill="none" stroke={ARC[tone]} strokeWidth="1.4" strokeDasharray={`${c * frac} ${c}`} strokeLinecap="butt" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-dots leading-none font-black text-bright" style={{ fontSize: size * 0.3 }}>
            {shown}
          </span>
          {denominator != null && value != null && <span className="mt-2 font-plex text-xs text-lightgray">of {denominator.toLocaleString("en-US")}</span>}
        </div>
      </div>
      <figcaption className="text-center">
        <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{label}</span>
        {footer && <div className="mt-1">{footer}</div>}
      </figcaption>
    </figure>
  );
}
