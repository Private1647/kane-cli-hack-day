import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { query } from "@/lib/db";
import { getEvent } from "@/lib/event";
import { memberActor, type MemberRow } from "./auth";
import { AppError, idempotent, withAudit } from "./core";
import { POLICY_VERSION } from "./passport";

// The profile photo taken on /register (the avatar in the site header). It is
// stored exactly like the old activation selfie: one current row in `selfies`,
// the file in the private Blob store, an explicit selfie_storage consent row,
// deleted 30 days after the event. Only a real (trusted) shutter click counts.
//
// Local development has no Blob token, so when HACKOS_ENV=local and no token
// is set, files go to .local-blob/ in the working directory instead. That
// fallback is never used in production (HACKOS_ENV/VERCEL_ENV production, or
// any Vercel deployment).

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PREFIX = "selfie/";

export function localStoreEnabled() {
  if (process.env.VERCEL || process.env.VERCEL_ENV === "production" || process.env.HACKOS_ENV === "production") return false;
  return process.env.HACKOS_ENV === "local" && !process.env.BLOB_READ_WRITE_TOKEN;
}

const localRoot = () => path.join(process.cwd(), ".local-blob");
const localPath = (key: string) => {
  const p = path.join(localRoot(), key);
  if (!p.startsWith(localRoot() + path.sep)) throw new AppError("VALIDATION_FAILED");
  return p;
};

async function putPrivate(key: string, file: File) {
  if (localStoreEnabled()) {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, Buffer.from(await file.arrayBuffer()));
    await writeFile(`${p}.type`, file.type);
    return;
  }
  await put(key, file, { access: "private", contentType: file.type, addRandomSuffix: false });
}

/** The stored file, or null. */
export async function getPrivate(key: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  if (localStoreEnabled()) {
    try {
      const p = localPath(key);
      const [body, type] = await Promise.all([readFile(p), readFile(`${p}.type`, "utf8").catch(() => "image/jpeg")]);
      return { body, contentType: type };
    } catch {
      return null;
    }
  }
  const file = await get(key, { access: "private" }).catch(() => null);
  return file?.stream ? { body: file.stream, contentType: file.blob.contentType ?? "image/jpeg" } : null;
}

export async function deletePrivate(keys: string[]) {
  if (!keys.length) return;
  if (localStoreEnabled()) {
    await Promise.all(keys.map((k) => rm(localPath(k), { force: true }).then(() => rm(`${localPath(k)}.type`, { force: true })))).catch(() => {});
    return;
  }
  await del(keys).catch((e) => console.error("[avatar] blob delete failed; retention job will retry", e));
}

/**
 * Save the profile photo the person just took. `consent` is the explicit
 * "store my photo" answer on the photo step; it is recorded as a
 * selfie_storage consent row before anything is stored.
 */
export async function saveAvatar(member: MemberRow, file: File, opts: { trusted: boolean; consent: boolean; idempotencyKey?: string | null }) {
  if (!opts.trusted) throw new AppError("FORBIDDEN", { userMessage: "The photo must be taken by pressing the shutter yourself." });
  if (!opts.consent) throw new AppError("CONSENT_REQUIRED", { userMessage: "Tick “Store my photo” to save it, or skip the photo." });
  if (!TYPES.has(file.type) || file.size === 0 || file.size > MAX_BYTES) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "That photo is too large or not an image. Try again." });
  }
  const { result } = await idempotent(opts.idempotencyKey, `avatar:member:${member.id}`, async () => {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${PREFIX}${member.id}/${randomBytes(8).toString("hex")}.${ext}`;
    try {
      await putPrivate(key, file);
    } catch (e) {
      console.error("[avatar] upload failed", e);
      throw new AppError("DOWNSTREAM_DEGRADED", { userMessage: "Your photo didn’t upload. Try again, or skip it for now." });
    }
    const ev = await getEvent();
    const deletionDue = new Date(ev.endsAt.getTime() + 30 * 86_400_000);
    let old: string[] = [];
    const out = await withAudit(memberActor(member), "profile.photo_saved", "selfie", async (tx) => {
      const { rows: cur } = await tx.query<{ granted: boolean }>("select granted from member_consent_current where member_id = $1 and category = 'selfie_storage'", [member.id]);
      if (cur[0]?.granted !== true) {
        await tx.query("insert into member_consents (member_id, category, granted, policy_version, source) values ($1, 'selfie_storage', true, $2, 'web')", [member.id, POLICY_VERSION]);
      }
      const { rows: prev } = await tx.query<{ object_key: string }>("update selfies set deleted_at = now() where member_id = $1 and deleted_at is null returning object_key", [member.id]);
      old = prev.map((r) => r.object_key);
      const { rows } = await tx.query<{ id: number }>(
        "insert into selfies (member_id, object_key, captured_by, approved_at, deletion_due_at) values ($1, $2, 'participant', now(), $3) returning id",
        [member.id, key, deletionDue],
      );
      await tx.query("update members set photo_step_at = coalesce(photo_step_at, now()) where id = $1", [member.id]);
      return { result: { selfie_id: rows[0].id }, resourceId: rows[0].id, payload: { trusted_click: true } };
    });
    await deletePrivate(old);
    return out;
  });
  return result;
}

/** The person skipped the photo step (no consent row: they were not asked to store anything). */
export async function skipAvatar(member: MemberRow) {
  await query("update members set photo_step_at = coalesce(photo_step_at, now()) where id = $1", [member.id]);
}

/** Where the avatar is served; the route decides who may see it. */
export const avatarSrc = (memberId: number, version?: Date | null) => `/passport/portrait?m=${memberId}${version ? `&v=${new Date(version).getTime()}` : ""}`;

/** The current photo's time (for cache-busting avatarSrc), or null when there is none. */
export async function avatarVersion(memberId: number) {
  const [row] = await query<{ captured_at: Date }>("select captured_at from selfies where member_id = $1 and deleted_at is null", [memberId]);
  return row?.captured_at ?? null;
}
