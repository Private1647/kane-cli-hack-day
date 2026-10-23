"use server";

import { refresh } from "next/cache";
import { isAdmin } from "@/lib/session";
import { staffLogout } from "@/server/auth";
import { deleteNotification, eventTime, notify, seedScheduleNudges } from "@/lib/notifications";
import { setRegistrationOpen } from "@/lib/teams";
import { teamExists } from "./queries";

export async function adminLogout() {
  await staffLogout();
  refresh();
}

export async function toggleRegistration(open: boolean) {
  if (!(await isAdmin())) throw new Error("Not an admin");
  await setRegistrationOpen(open);
  refresh();
}

// ── Nudges ──────────────────────────────────────────────────────────────────

export type SeedState = { added?: number; error?: string } | null;

export async function seedReminders(): Promise<SeedState> {
  if (!(await isAdmin())) return { error: "Not an admin." };
  const added = await seedScheduleNudges();
  refresh();
  return { added };
}

export type NudgeValues = { title: string; body: string; href: string; audience: string; when: string; at: string; minutes: string };
export type NudgeState = { error?: string; ok?: string; values?: NudgeValues } | null;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A same-site path ("/t/x#y", not "//host") or an absolute https URL. */
function validLink(s: string) {
  if (s.startsWith("/")) return !s.startsWith("//") && !s.includes("\\") && !/\s/.test(s);
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

export async function sendNudge(_prev: NudgeState, form: FormData): Promise<NudgeState> {
  if (!(await isAdmin())) return { error: "Not an admin." };
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const values: NudgeValues = {
    title: str("title"),
    body: str("body"),
    href: str("href"),
    audience: str("audience") || "all",
    when: str("when") || "now",
    at: str("at"),
    minutes: str("minutes"),
  };
  const fail = (error: string): NudgeState => ({ error, values });

  if (!values.title) return fail("Title is required.");
  if (values.title.length > 80) return fail("Title must be 80 characters or fewer.");
  if (values.body.length > 300) return fail("Body must be 300 characters or fewer.");
  if (values.href && (values.href.length > 500 || !validLink(values.href))) return fail("Link must be a path starting with / or an https:// URL.");

  let teamId: number | null = null;
  if (values.audience !== "all") {
    teamId = Number(values.audience);
    if (!Number.isSafeInteger(teamId) || teamId <= 0 || !(await teamExists(teamId))) return fail("Pick a team that exists.");
  }

  let sendAt: Date | undefined;
  if (values.when === "at") {
    if (!HHMM.test(values.at)) return fail("Time must be HH:MM (24-hour) on event day.");
    sendAt = eventTime(values.at);
    if (sendAt.getTime() < Date.now() - 60_000) return fail("That time has already passed. Send it now instead.");
  } else if (values.when === "in") {
    const minutes = Number(values.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) return fail("Minutes must be a whole number between 1 and 10080.");
    sendAt = new Date(Date.now() + minutes * 60_000);
  } else if (values.when !== "now") {
    return fail("Pick when to send it.");
  }

  await notify({ teamId, kind: "admin", title: values.title, body: values.body, href: values.href || null, sendAt });
  refresh();
  return { ok: sendAt ? "Scheduled." : "Sent." };
}

export async function removeNudge(id: number) {
  if (!(await isAdmin())) throw new Error("Not an admin");
  if (!Number.isSafeInteger(id)) return;
  await deleteNotification(id);
  refresh();
}
