"use server";

import { refresh } from "next/cache";
import { setup } from "@/data/hackday";
import { markSeen } from "@/lib/notifications";
import { isRegPath, normalizeLinkedin, normalizeX, setMemberConsent, setTeamPhoto, updateMemberProfile } from "@/lib/photos";
import { PROGRESS_IDS, PROGRESS_ITEMS } from "@/lib/progress";
import { getMemberSession } from "@/lib/session";
import {
  getMembers,
  getTeamBySlug,
  logActivity,
  saveProgress,
  setSetupTick,
} from "@/lib/teams";

export type FormState = { error?: string; ok?: boolean } | null;

/** Re-checks the cookie against the database on every action; never trust the client. */
async function requireMember(slug: string) {
  const team = await getTeamBySlug(slug);
  if (!team) throw new Error("Not signed in to this team");
  // A personal sign-in by someone on this team (there is no shared team password).
  const personal = await getMemberSession();
  const memberId = personal?.personal ? personal.memberId : null;
  const member = memberId ? (await getMembers(team.id)).find((m) => m.id === memberId) : undefined;
  if (!member) throw new Error("Not signed in to this team");
  return { team, member };
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
