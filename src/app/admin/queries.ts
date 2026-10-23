import "server-only";
import { query } from "@/lib/db";

// Admin-only reads that the shared libs don't cover: photo/consent rollups for
// the teams table and CSVs, and the nudge list with audience and link.

export type TeamPhotoStats = {
  team_id: number;
  has_photo: boolean;
  /** Members who said yes / no; the rest haven't been asked yet. */
  consented: number;
  declined: number;
  member_count: number;
  selfies: number;
  socials: number;
  gallery: number;
};

export async function listTeamPhotoStats() {
  return query<TeamPhotoStats>(
    `select t.id as team_id,
            t.photo_url is not null as has_photo,
            (select count(*)::int from members m where m.team_id = t.id and m.consent_social) as consented,
            (select count(*)::int from members m where m.team_id = t.id and m.consent_social = false) as declined,
            (select count(*)::int from members m where m.team_id = t.id) as member_count,
            (select count(*)::int from members m where m.team_id = t.id and m.photo_url is not null) as selfies,
            (select count(*)::int from members m
              where m.team_id = t.id and (nullif(m.linkedin, '') is not null or nullif(m.x_handle, '') is not null)) as socials,
            (select count(*)::int from event_photos e where e.team_id = t.id) as gallery
       from teams t`,
  );
}

export type MemberSocials = { id: number; linkedin: string | null; x_handle: string | null; has_photo: boolean; consent_social: boolean | null };

export async function listMemberSocials() {
  return query<MemberSocials>("select id, linkedin, x_handle, photo_url is not null as has_photo, consent_social from members");
}

export type NudgeRow = {
  id: number;
  team_id: number | null;
  team_name: string | null;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  send_at: Date;
  sent: boolean;
};

/** Every notification except per-team photo drops, newest first. */
export async function listNudges(limit = 200) {
  return query<NudgeRow>(
    `select n.id, n.team_id, t.name as team_name, n.kind, n.title, n.body, n.href, n.send_at,
            n.send_at <= now() as sent
       from notifications n left join teams t on t.id = n.team_id
      where n.kind <> 'photo'
      order by n.send_at desc limit $1`,
    [limit],
  );
}

export async function listTeamOptions() {
  return query<{ id: number; name: string }>("select id, name from teams order by lower(name)");
}

export async function teamExists(id: number) {
  const rows = await query("select 1 from teams where id = $1", [id]);
  return rows.length > 0;
}
