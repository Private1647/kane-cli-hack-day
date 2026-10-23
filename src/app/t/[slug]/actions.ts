"use server";

import { refresh } from "next/cache";
import { setup } from "@/data/hackday";
import { markSeen } from "@/lib/notifications";
import { isRegPath, normalizeLinkedin, normalizeX, setMemberConsent, setTeamPhoto, updateMemberProfile } from "@/lib/photos";
import { PROGRESS_IDS, PROGRESS_ITEMS } from "@/lib/progress";
import { verifyPassword } from "@/lib/password";
import { clearTeamSession, getTeamSession, setTeamSession } from "@/lib/session";
import {
  MAX_MEMBERS,
  RegistrationError,
  addMember,
  getMembers,
  getTeamBySlug,
  logActivity,
  saveProgress,
  setSetupTick,
} from "@/lib/teams";

export type FormState = { error?: string; ok?: boolean } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Re-checks the cookie against the database on every action; never trust the client. */
async function requireMember(slug: string) {
  const team = await getTeamBySlug(slug);
  const session = await getTeamSession();
  if (!team || session?.teamId !== team.id || !session.memberId) throw new Error("Not signed in to this team");
  const member = (await getMembers(team.id)).find((m) => m.id === session.memberId);
  if (!member) throw new Error("Member not found");
  return { team, member };
}

export async function joinTeam(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const team = await getTeamBySlug(slug);
  if (!team) return { error: "Team not found." };
  const ok = await verifyPassword(String(form.get("password") ?? ""), team.password_hash);
  if (!ok) return { error: "Wrong password." };
  await setTeamSession({ teamId: team.id, memberId: null });
  refresh();
  return { ok: true };
}

export async function pickMember(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const team = await getTeamBySlug(slug);
  const session = await getTeamSession();
  if (!team || session?.teamId !== team.id) return { error: "Enter the team password first." };
  const memberId = Number(form.get("memberId"));
  const member = (await getMembers(team.id)).find((m) => m.id === memberId);
  if (!member) return { error: "Pick your name from the list." };
  await setTeamSession({ teamId: team.id, memberId: member.id });
  await logActivity(team.id, member.id, "Signed in");
  refresh();
  return { ok: true };
}

export async function switchMember(slug: string) {
  const team = await getTeamBySlug(slug);
  const session = await getTeamSession();
  if (team && session?.teamId === team.id) await setTeamSession({ teamId: team.id, memberId: null });
  refresh();
}

export async function leaveTeam() {
  await clearTeamSession();
  refresh();
}

export async function updateItem(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { team, member } = await requireMember(slug);
  const item = String(form.get("item") ?? "");
  if (!PROGRESS_IDS.has(item)) return { error: "Unknown item." };
  const value = String(form.get("value") ?? "").trim().slice(0, 500);
  const done = form.get("done") === "on";
  if (done && !value) return { error: "Add the link before marking it done." };

  await saveProgress(team.id, member.id, item, value, done);
  const label = PROGRESS_ITEMS.find((i) => i.id === item)!.label;
  await logActivity(team.id, member.id, done ? `Marked ${label} done` : `Updated ${label}`);
  refresh();
  return { ok: true };
}

export async function addTeammate(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { team, member } = await requireMember(slug);
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!name || name.length > 40) return { error: "Enter a name (up to 40 characters)." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email." };

  const members = await getMembers(team.id);
  if (team.is_solo) return { error: "Solo registrations have one member." };
  if (members.length >= MAX_MEMBERS) return { error: `Teams can have up to ${MAX_MEMBERS} members.` };
  if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return { error: "That name is already on the team." };

  try {
    await addMember(team.id, name, email);
  } catch (err) {
    if (err instanceof RegistrationError) return { error: err.message };
    throw err;
  }
  await logActivity(team.id, member.id, `Added ${name} to the team`);
  refresh();
  return { ok: true };
}

const SETUP_IDS = new Set(setup.map((s) => s.id));

export async function toggleSetup(slug: string, step: string, done: boolean) {
  const { member } = await requireMember(slug);
  if (!SETUP_IDS.has(step)) throw new Error("Unknown setup step");
  await setSetupTick(member.id, step, done);
  refresh();
}

// ── Photos, profile and consent ─────────────────────────────────────────────

export async function saveProfile(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { team, member } = await requireMember(slug);
  const linkedin = normalizeLinkedin(String(form.get("linkedin") ?? ""));
  if (linkedin === null) return { error: "LinkedIn should look like linkedin.com/in/your-name." };
  const xHandle = normalizeX(String(form.get("x") ?? ""));
  if (xHandle === null) return { error: "X handle should look like @handle." };
  await updateMemberProfile(member.id, { linkedin: linkedin || null, x_handle: xHandle || null });
  await logActivity(team.id, member.id, "Updated their profile");
  refresh();
  return { ok: true };
}

/** Saves (or clears, with null) the signed-in member's selfie. */
export async function saveSelfie(slug: string, pathname: string | null) {
  const { team, member } = await requireMember(slug);
  if (pathname !== null && !isRegPath(pathname)) throw new Error("Bad photo");
  await updateMemberProfile(member.id, { photo_url: pathname });
  await logActivity(team.id, member.id, pathname ? "Added a selfie" : "Removed their selfie");
  refresh();
}

export async function saveTeamPhoto(slug: string, pathname: string | null) {
  const { team, member } = await requireMember(slug);
  if (pathname !== null && !isRegPath(pathname)) throw new Error("Bad photo");
  await setTeamPhoto(team.id, pathname);
  await logActivity(team.id, member.id, pathname ? "Added the team photo" : "Removed the team photo");
  refresh();
}

/** The signed-in member's own answer; nobody can answer for a teammate. */
export async function saveConsent(slug: string, consent: boolean) {
  const { team, member } = await requireMember(slug);
  await setMemberConsent(member.id, consent);
  await logActivity(team.id, member.id, consent ? "Said yes to photos and posts" : "Said no to photos and posts");
  refresh();
}

export async function markNotificationsSeen(slug: string) {
  const { member } = await requireMember(slug);
  await markSeen(member.id);
}
