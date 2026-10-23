import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Small signed cookies: base64url(JSON) + "." + HMAC. Nothing secret is stored
// in them, the signature just stops anyone forging a team or admin session.

const TEAM_COOKIE = "hd_team";
const ADMIN_COOKIE = "hd_admin";
const MAX_AGE = 60 * 60 * 24 * 3; // the event plus a margin

export type TeamSession = { teamId: number; memberId: number | null };

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

export async function isAdmin() {
  return unsign<{ admin: true }>((await cookies()).get(ADMIN_COOKIE)?.value)?.admin === true;
}

export async function setAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, sign({ admin: true }), { ...cookieOptions, maxAge: 60 * 60 * 12 });
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}
