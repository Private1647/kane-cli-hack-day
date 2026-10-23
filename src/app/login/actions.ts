"use server";

import { redirect } from "next/navigation";
import { hubPath, isHubTab } from "@/lib/hub";
import { verifyPassword } from "@/lib/password";
import { setTeamSession } from "@/lib/session";
import { getTeamBySlug, slugify } from "@/lib/teams";
import { clientKey, rateLimit } from "@/server/ratelimit";

export type LoginState = { error?: string } | null;

// Team name + password from any device. The hub then asks "who are you?".
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  // T-SEC-01: slow down password guessing per client.
  if (!(await rateLimit(`team-login:${await clientKey()}`, { limit: 20, windowSec: 300 })).ok) return { error: "Too many tries. Wait a few minutes and try again." };
  const name = String(form.get("team") ?? "").trim();
  const next = String(form.get("next") ?? "");
  const team = name ? await getTeamBySlug(slugify(name)) : null;
  // Same message either way, so the form doesn't confirm which teams exist.
  const ok = team && (await verifyPassword(String(form.get("password") ?? ""), team.password_hash));
  if (!team || !ok) return { error: "That team name and password don’t match." };

  await setTeamSession({ teamId: team.id, memberId: null });
  redirect(hubPath(team.slug, isHubTab(next) ? next : ""));
}
