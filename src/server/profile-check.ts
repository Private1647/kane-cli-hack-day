import "server-only";
import { normalizeLinkedin, normalizeX } from "@/lib/photos";
import { githubFromInput } from "@/lib/profile-fields";

// "Is this a real profile?" for the /register social fields. Public pages only,
// no accounts or tokens: a 200 means found, a 404 means no such profile.
// LinkedIn turns automated visitors away with a 999 (also for real profiles
// when it's busy), so for LinkedIn only "found" is certain.

export type ProfileKind = "linkedin" | "x" | "github";
export type ProfileCheck = { status: "verified" | "not_found" | "unknown" | "invalid"; url: string | null };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

async function statusOf(url: string, init: RequestInit = {}): Promise<number | null> {
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(5000), ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

const verdict = (code: number | null): ProfileCheck["status"] => (code === 200 ? "verified" : code === 404 || code === 410 ? "not_found" : "unknown");

export async function checkProfile(kind: ProfileKind, raw: string): Promise<ProfileCheck> {
  if (kind === "github") {
    const name = githubFromInput(raw).replace(/^@/, "");
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(name)) return { status: "invalid", url: null };
    const url = `https://github.com/${name}`;
    const token = process.env.GITHUB_TOKEN;
    const code = await statusOf(`https://api.github.com/users/${encodeURIComponent(name)}`, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    // Rate-limited API (403/429): fall back to the public page.
    return { status: verdict(code === 403 || code === 429 || code === null ? await statusOf(url) : code), url };
  }
  if (kind === "x") {
    const handle = normalizeX(raw);
    if (!handle) return { status: "invalid", url: null };
    const url = `https://x.com/${handle}`;
    let code = await statusOf(url);
    if (code !== 200 && code !== 404) code = await statusOf(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${handle}`)}`);
    return { status: verdict(code), url };
  }
  const url = normalizeLinkedin(raw);
  if (!url) return { status: "invalid", url: null };
  const code = await statusOf(url);
  return { status: code === 200 ? "verified" : code === 404 ? "not_found" : "unknown", url };
}
