import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Small signed cookies: base64url(JSON) + "." + HMAC. Nothing secret is stored
// in them, the signature just stops anyone forging a team or admin session.

const TEAM_COOKIE = "hd_team";
const ADMIN_COOKIE = "hd_admin";
// Hack OS: a member signed in on their own (no team needed) and staff by role.
const MEMBER_COOKIE = "hd_member";
const STAFF_COOKIE = "hd_staff";
const MAX_AGE = 60 * 60 * 24 * 3; // the event plus a margin

export type TeamSession = { teamId: number; memberId: number | null };
/** A person, independent of any team. */
export type MemberSession = { memberId: number };
/** Staff signed in with email + one-time code. Role is re-checked against the DB on use. */
export type StaffSession = { staffId: number; role: string; exp: number };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function unsign<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export async function getTeamSession() {
  return unsign<TeamSession>((await cookies()).get(TEAM_COOKIE)?.value);
}

export async function setTeamSession(session: TeamSession) {
  (await cookies()).set(TEAM_COOKIE, sign(session), cookieOptions);
}

export async function clearTeamSession() {
  (await cookies()).delete(TEAM_COOKIE);
}

/** The legacy ADMIN_PASSWORD cookie (treated as the admin role). */
export async function hasAdminCookie() {
  return unsign<{ admin: true }>((await cookies()).get(ADMIN_COOKIE)?.value)?.admin === true;
}

/**
 * Organizer-level access: the legacy admin cookie, or a staff session with
 * role admin/organizer. Cheap (cookie only); server/auth.ts getStaff() also
 * re-checks the account is still active.
 */
export async function isAdmin() {
  if (await hasAdminCookie()) return true;
  const staff = await getStaffSession();
  return staff?.role === "admin" || staff?.role === "organizer";
}

export async function setAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, sign({ admin: true }), { ...cookieOptions, maxAge: 60 * 60 * 12 });
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

// ── Hack OS: member and staff sessions ──────────────────────────────────────
// Use src/server/auth.ts (getViewer, requireMember, requireRole…) rather than
// these directly; it combines them with the team cookie and the DB.

export async function getMemberSession() {
  return unsign<MemberSession>((await cookies()).get(MEMBER_COOKIE)?.value);
}

export async function setMemberSession(session: MemberSession) {
  (await cookies()).set(MEMBER_COOKIE, sign(session), cookieOptions);
}

export async function clearMemberSession() {
  (await cookies()).delete(MEMBER_COOKIE);
}

const STAFF_HOURS = 14;

export async function getStaffSession() {
  const s = unsign<StaffSession>((await cookies()).get(STAFF_COOKIE)?.value);
  return s && s.exp > Date.now() ? s : null;
}

export async function setStaffSession(staffId: number, role: string) {
  const exp = Date.now() + STAFF_HOURS * 3_600_000;
  (await cookies()).set(STAFF_COOKIE, sign({ staffId, role, exp }), { ...cookieOptions, maxAge: STAFF_HOURS * 3600 });
}

export async function clearStaffSession() {
  (await cookies()).delete(STAFF_COOKIE);
}
