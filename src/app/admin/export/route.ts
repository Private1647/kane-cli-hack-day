import { PROGRESS_ITEMS, shippedMinimum } from "@/lib/progress";
import { isAdmin } from "@/lib/session";
import { listAllMembers, listAllProgress, listTeams } from "@/lib/teams";
import { listMemberSocials, listTeamPhotoStats } from "../queries";

// CSV downloads for judges and organizers: one row per team, or per member.

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise leading formula characters for spreadsheet apps.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");

export async function GET(request: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const type = new URL(request.url).searchParams.get("type") === "members" ? "members" : "teams";

  let csv: string;
  if (type === "members") {
    const [members, socials] = await Promise.all([listAllMembers(), listMemberSocials()]);
    const byMember = new Map(socials.map((s) => [s.id, s]));
    csv = toCsv([
      ["team", "slug", "track", "name", "email", "consent_social", "linkedin", "x_handle", "has_photo"],
      ...members.map((m) => {
        const s = byMember.get(m.id);
        const consent = s?.consent_social == null ? "not asked" : s.consent_social ? "yes" : "no";
        return [m.team_name, m.team_slug, m.track, m.name, m.email, consent, s?.linkedin, s?.x_handle, s?.has_photo ? "yes" : "no"];
      }),
    ]);
  } else {
    const [teams, progress, photoStats] = await Promise.all([listTeams(), listAllProgress(), listTeamPhotoStats()]);
    const photos = new Map(photoStats.map((p) => [p.team_id, p]));
    const values = new Map(progress.map((p) => [`${p.team_id}:${p.item}`, p]));
    csv = toCsv([
      ["team", "slug", "solo", "track", "idea", "members", "done", "shipped", "consented", "has_photo", ...PROGRESS_ITEMS.map((i) => i.label)],
      ...teams.map((t) => {
        const done = new Set(t.done_items);
        return [
          t.name,
          t.slug,
          t.is_solo ? "yes" : "no",
          t.track,
          t.idea,
          t.member_names.join("; "),
          `${done.size}/${PROGRESS_ITEMS.length}`,
          shippedMinimum(done) ? "yes" : "no",
          `${photos.get(t.id)?.consented ?? 0}/${t.member_count}`,
          photos.get(t.id)?.has_photo ? "yes" : "no",
          ...PROGRESS_ITEMS.map((i) => {
            const p = values.get(`${t.id}:${i.id}`);
            return p ? `${p.done ? "[x] " : "[ ] "}${p.value}` : "";
          }),
        ];
      }),
    ]);
  }

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hackday-${type}.csv"`,
      "cache-control": "no-store",
    },
  });
}
