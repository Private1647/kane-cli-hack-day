import type { ReactNode } from "react";

// The one way to show a state (PLAN §3). Always text + glyph, never colour alone.
//   verified   teal ✓ VERIFIED : evidence-backed success only
//   pending    amber           : waiting on a human or a deadline
//   danger     red ✕           : confirmed failure / outage
//   suspected  grey outline ?  : a detection (e.g. a failing Kane run), not a confirmed bug
//   unverified grey outline ○  : a claim with no evidence attached
//   accent     lime →          : act here / you are here. Never means "passed".

export type PillTone = "verified" | "pending" | "danger" | "suspected" | "unverified" | "accent";

const TONES: Record<PillTone, { cls: string; glyph: string; label: string }> = {
  verified: { cls: "border-verified bg-verified-deep text-verified", glyph: "✓", label: "Verified" },
  pending: { cls: "border-warning bg-warning-deep text-warning", glyph: "◷", label: "Pending" },
  danger: { cls: "border-danger bg-danger-deep text-danger", glyph: "✕", label: "Failed" },
  suspected: { cls: "border-lightgray border-dashed text-lightgray", glyph: "?", label: "Suspected" },
  unverified: { cls: "border-lightgray text-lightgray", glyph: "○", label: "Unverified" },
  accent: { cls: "border-lime bg-lime-deep text-lime", glyph: "→", label: "Next" },
};

export default function StatusPill({
  tone,
  children,
  size = "sm",
  className = "",
  title,
}: {
  tone: PillTone;
  /** Defaults to the tone's word (VERIFIED, PENDING…). For verified, keep the word VERIFIED in it. */
  children?: ReactNode;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const t = TONES[tone];
  const sz = size === "md" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border font-pixel uppercase tracking-[0.18em] whitespace-nowrap ${sz} ${t.cls} ${className}`}
    >
      <span aria-hidden="true" className="font-plex not-italic">
        {t.glyph}
      </span>
      <span>{children ?? t.label}</span>
    </span>
  );
}
