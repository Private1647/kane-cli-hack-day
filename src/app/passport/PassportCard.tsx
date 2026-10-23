import type { ReactNode } from "react";
import StatusPill from "@/components/ui/StatusPill";
import HalftonePortrait, { Monogram } from "./HalftonePortrait";

// The passport object: the one bright card on the black page (PLAN §3.2).
// Front and back are plain server markup fed by a DTO, so the public scan
// view and the private passport render the same card from different data.

export type CardFace = {
  short_name: string;
  role_tag: string;
  handle: string | null;
  edition: string;
  portrait_src: string | null;
  activated: boolean;
  kane_verified: boolean;
  team_label: string;
  /** Private view only. */
  receipt_code?: string | null;
  public_code?: string | null;
};

export const initialsOf = (name: string) =>
  name
    .replace(/[^\p{L}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "KH";

const faceCls = "flex aspect-[5/7] w-full flex-col overflow-hidden border border-ink/10 bg-card p-4 text-ink sm:p-5";
const tiny = "font-pixel text-[9px] uppercase tracking-[0.2em] text-ink/60";

export function PassportFront({ face, qr }: { face: CardFace; qr?: ReactNode }) {
  return (
    <div className={faceCls}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={tiny}>Kane Hack Day · SF</p>
          <p className="mt-1 font-dots text-xl leading-none font-black">{face.edition}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- the official mascot asset, tiny */}
        <img src="/logos/kaneai-mascot.png" alt="Kane AI" width={140} height={122} className="h-7 w-auto" />
      </div>

      <div className="mt-4 aspect-square w-full overflow-hidden">
        {face.portrait_src ? <HalftonePortrait src={face.portrait_src} initials={initialsOf(face.short_name)} className="h-full w-full" /> : <Monogram initials={initialsOf(face.short_name)} />}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-2xl leading-tight font-semibold sm:text-3xl">{face.short_name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 font-plex text-xs text-ink/70">
            <span className="border border-ink px-1.5 py-0.5 font-pixel text-[9px] tracking-[0.2em] text-ink">{face.role_tag}</span>
            {face.handle && <span className="truncate">{face.handle}</span>}
          </p>
          <p className="mt-1 truncate font-plex text-xs text-ink/70">{face.team_label}</p>
        </div>
        {qr && <div className="shrink-0">{qr}</div>}
      </div>

      <div className="mt-auto pt-3">
        {face.kane_verified ? (
          // The ribbon appears only when Kane run B is source-verified.
          <div className="flex items-center justify-between gap-2 bg-ink px-3 py-1.5">
            <StatusPill tone="verified">Verified · Kane browser check</StatusPill>
            {face.receipt_code && <span className="font-plex text-[10px] text-lightgray">{face.receipt_code}</span>}
          </div>
        ) : (
          <p className="flex items-center justify-between gap-2 border-t border-ink/20 pt-2 font-plex text-[11px] text-ink/70">
            <span>{face.activated ? "Activated" : "Not activated yet"}</span>
            <span>{face.receipt_code ?? face.public_code ?? ""}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export function BackSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-ink/15 py-2.5 first:border-t-0 first:pt-0">
      <p className={tiny}>{title}</p>
      <div className="mt-1.5 font-plex text-xs text-ink">{children}</div>
    </div>
  );
}

export function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <span className="text-ink/60">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className="border border-ink/30 px-1.5 py-0.5 font-plex text-[11px]">
          {s}
        </span>
      ))}
    </span>
  );
}

export function PassportBack({ children }: { children: ReactNode }) {
  return <div className={`${faceCls} overflow-y-auto`}>{children}</div>;
}
