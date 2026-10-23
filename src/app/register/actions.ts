"use server";

import { redirect } from "next/navigation";
import { challenge } from "@/data/hackday";
import { isRegPath, normalizeLinkedin, normalizeX } from "@/lib/photos";
import { setMemberSession, setTeamSession } from "@/lib/session";
import { MAX_MEMBERS, RegistrationError, isRegistrationOpen, isSlugTaken, registerTeam, slugify } from "@/lib/teams";

export type RegisterState = { error?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  if (!(await isRegistrationOpen())) return { error: "Registration is closed." };

  const name = String(form.get("name") ?? "").trim();
  const track = String(form.get("track") ?? "");
  const idea = String(form.get("idea") ?? "").trim();
  const isSolo = form.get("mode") === "solo";
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const teamPhoto = String(form.get("teamPhoto") ?? "");
  const consentSocial = form.get("consentSocial") === "on";

  // Member fields arrive as parallel lists, one entry per row.
  const all = (k: string) => form.getAll(k).map((v) => String(v).trim());
  const [names, emails, photos, linkedins, xs] = ["memberName", "memberEmail", "memberPhoto", "memberLinkedin", "memberX"].map(all);
  const rows = names
    .map((n, i) => ({ name: n, email: (emails[i] ?? "").toLowerCase(), photo: photos[i] ?? "", linkedin: linkedins[i] ?? "", x: xs[i] ?? "" }))
    .filter((m) => m.name || m.email);

  if (name.length < 2 || name.length > 40) return { error: "Team name needs 2 to 40 characters." };
  if (!slugify(name)) return { error: "Team name needs at least one letter or number." };
  if (!challenge.tracks.includes(track)) return { error: "Pick a track." };
  if (idea.length < 5 || idea.length > 200) return { error: "Give a one-line idea (5 to 200 characters)." };
  if (rows.length === 0) return { error: "Add at least one member." };
  if (isSolo && rows.length > 1) return { error: "Solo registrations have one member." };
  if (rows.length > MAX_MEMBERS) return { error: `Teams can have up to ${MAX_MEMBERS} members.` };
  const members = [];
  for (const m of rows) {
    if (!m.name) return { error: "Every member needs a name." };
    if (!EMAIL.test(m.email)) return { error: `Enter a valid email for ${m.name}.` };
    const linkedin = normalizeLinkedin(m.linkedin);
    if (linkedin === null) return { error: `${m.name}'s LinkedIn should look like linkedin.com/in/your-name.` };
    const xHandle = normalizeX(m.x);
    if (xHandle === null) return { error: `${m.name}'s X handle should look like @handle.` };
    members.push({ name: m.name, email: m.email, photoUrl: isRegPath(m.photo) ? m.photo : null, linkedin: linkedin || null, xHandle: xHandle || null });
  }
  if (new Set(members.map((m) => m.name.toLowerCase())).size !== members.length)
    return { error: "Member names must be different so each person can pick theirs." };
  if (new Set(members.map((m) => m.email)).size !== members.length) return { error: "Each member needs their own email." };
  if (password.length < 4) return { error: "Team password needs at least 4 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  let slug: string;
  try {
    const team = await registerTeam({
      name,
      track,
      idea,
      isSolo,
      password,
      members,
      photoUrl: isRegPath(teamPhoto) ? teamPhoto : null,
      captainConsent: consentSocial,
    });
    slug = team.slug;
    if (team.registrant?.created) {
      // The person at this keyboard just created their own account: sign them in
      // as themselves (personal), so pairing, consents and the selfie work now.
      await setMemberSession({ memberId: team.registrant.id, personal: true });
      await setTeamSession({ teamId: team.teamId, memberId: team.registrant.id });
    } else {
      // An adopted account may be someone else's: hub access only, then "who are you?".
      await setTeamSession({ teamId: team.teamId, memberId: null });
    }
  } catch (err) {
    if (err instanceof RegistrationError) return { error: err.message };
    throw err;
  }
  redirect(`/t/${slug}?welcome=1`);
}

/** Live check while typing the team name. */
export async function checkName(name: string) {
  const slug = slugify(name.trim());
  if (!slug) return { slug: "", taken: false };
  return { slug, taken: await isSlugTaken(slug) };
}
