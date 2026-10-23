import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import QR from "@/components/ui/QR";
import { query } from "@/lib/db";
import { getPersonalMember, getStaff, hasRole, memberActor, staffActor } from "@/server/auth";
import { siteUrl, type Actor } from "@/server/core";
import { shortName } from "@/server/pairing";
import { EDITION, getBadgeToken } from "@/server/passport";
import PrintButton from "./PrintButton";

export const metadata: Metadata = { title: "Print badge", robots: { index: false } };

// Printable badges (T-PASS-05/06): ink on white (.print-paper), one per page
// for yourself, or an 8-up sheet for organizers printing at the desk. The QR
// is the revocable signed badge token; the P-code underneath is the offline
// ID staff type in when a QR won't scan. No email or other PII is printed.

type BadgeData = { memberId: number; name: string; role: string; team: string; code: string | null; token: string };

const ROLE: Record<string, string> = { participant: "BUILDER", mentor: "MENTOR", judge: "JUDGE", photographer: "PHOTO", organizer: "ORGANIZER", admin: "ORGANIZER" };
const MAX_SHEET = 48;

export default function BadgePage({ searchParams }: PageProps<"/passport/badge">) {
  return (
    <main className="print-paper min-h-screen py-8">
      <Suspense fallback={<p className="container-page font-plex text-sm">Preparing badges…</p>}>
        <Badges searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Badges({ searchParams }: Pick<PageProps<"/passport/badge">, "searchParams">) {
  const sp = await searchParams;
  const [member, staff] = await Promise.all([getPersonalMember(), getStaff()]);
  const organizer = hasRole(staff, "organizer");
  const layout = sp.layout === "8up" ? "8up" : "1up";

  let targets: { id: number; name: string; display_name: string | null; role: string; team: string | null; public_code: string | null }[] = [];
  let actor: Actor | null = null;
  if (organizer && staff && (layout === "8up" || typeof sp.codes === "string")) {
    // Desk printing: by P-codes (?codes=P-1001,P-1002) or everyone checked in.
    const codes = typeof sp.codes === "string" ? sp.codes.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SHEET) : null;
    targets = await query(
      `select m.id, m.name, m.display_name, m.role, t.name as team, m.public_code
         from members m left join teams t on t.id = m.team_id
        where m.deleted_at is null and ($1::text[] is null and m.checked_in_at is not null or m.public_code = any($1::text[]))
        order by m.public_code limit ${MAX_SHEET}`,
      [codes],
    );
    actor = staffActor(staff);
  } else if (member) {
    const [t] = await query<{ team: string | null }>("select t.name as team from members m left join teams t on t.id = m.team_id where m.id = $1", [member.id]);
    targets = [{ id: member.id, name: member.name, display_name: member.display_name, role: member.role, team: t?.team ?? null, public_code: member.public_code }];
    actor = memberActor(member);
  } else {
    return (
      <div className="container-page max-w-md space-y-4 font-plex text-sm">
        <p>Sign in to print your badge.</p>
        <Link href="/passport/login?next=/passport/badge" className="underline underline-offset-4">
          Sign in →
        </Link>
      </div>
    );
  }

  const badges: BadgeData[] = [];
  for (const t of targets) {
    const b = await getBadgeToken(t.id, actor!);
    badges.push({ memberId: t.id, name: shortName(t.display_name ?? t.name), role: ROLE[t.role] ?? "BUILDER", team: t.team ?? "Builder", code: t.public_code, token: b.token });
  }

  return (
    <div className="container-page">
      <div className="no-print mb-8 flex flex-wrap items-center gap-3 font-plex text-sm">
        <PrintButton />
        <Link href="/passport/badge" className={`min-h-11 border px-4 py-2.5 ${layout === "1up" ? "border-black" : "border-[#999]"}`} aria-current={layout === "1up" ? "page" : undefined}>
          1 per page
        </Link>
        {organizer && (
          <Link href="/passport/badge?layout=8up" className={`min-h-11 border px-4 py-2.5 ${layout === "8up" ? "border-black" : "border-[#999]"}`} aria-current={layout === "8up" ? "page" : undefined}>
            8-up sheet (checked in)
          </Link>
        )}
        <Link href="/passport" className="min-h-11 px-2 py-2.5 underline underline-offset-4">
          Back to passport
        </Link>
        <p className="w-full text-xs text-[#444]">
          {badges.length} badge{badges.length === 1 ? "" : "s"}. Lost badge? Rotate its QR from the passport and the printed one stops working.
        </p>
      </div>

      {layout === "8up" ? (
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 print:grid-cols-2">
          {badges.map((b, i) => (
            <div key={b.memberId} className={`print-avoid-break ${(i + 1) % 8 === 0 ? "print-break" : ""}`}>
              <Badge b={b} small />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {badges.map((b) => (
            <div key={b.memberId} className="print-break mx-auto max-w-[105mm]">
              <Badge b={b} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function Badge({ b, small = false }: { b: BadgeData; small?: boolean }) {
  return (
    <article
      aria-label={`Badge for ${b.name}`}
      className={`flex border border-dashed border-[#999] bg-white text-black ${small ? "h-[64mm] flex-row items-center gap-4 p-4" : "min-h-[140mm] flex-col p-6"}`}
    >
      <div className={`min-w-0 ${small ? "flex-1" : ""}`}>
        <p className="font-pixel text-[9px] uppercase tracking-[0.2em] text-[#444]">Kane CLI Hack Day · SF</p>
        <p className="mt-1 font-dots text-lg font-black">{EDITION}</p>
        <p className={`mt-3 font-display font-semibold leading-tight break-words ${small ? "text-2xl" : "text-4xl"}`}>{b.name}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 font-plex text-xs">
          <span className="border border-black px-1.5 py-0.5 font-pixel text-[9px] tracking-[0.2em]">{b.role}</span>
          <span className="truncate">{b.team}</span>
        </p>
      </div>
      <div className={`${small ? "" : "mt-auto flex items-end justify-between gap-4 pt-6"}`}>
        <QR value={siteUrl(`/passport/b/${b.token}`)} size={small ? 104 : 150} label={`Badge QR for ${b.name}`} />
        <div className={small ? "mt-1 text-center" : "text-right"}>
          <p className="font-pixel text-[9px] uppercase tracking-[0.2em] text-[#444]">Offline ID</p>
          <p className={`font-dots font-black ${small ? "text-xl" : "text-3xl"}`}>{b.code}</p>
        </div>
      </div>
    </article>
  );
}
