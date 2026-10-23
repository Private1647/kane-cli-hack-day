import { connection } from "next/server";
import { pool } from "@/lib/db";

// Readiness: can we serve Tier-0 (check-in, help, submission)? Needs the
// database and the session secret. Blob is reported but optional: uploads
// degrade, Tier-0 doesn't. 503 when not ready, so an uptime monitor can
// alert. No PII or secret values in the body.
export async function GET() {
  await connection();
  const checks: Record<string, { ok: boolean; ms?: number; detail?: string }> = {};
  const t0 = performance.now();
  try {
    await Promise.race([pool.query("select 1"), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
    checks.database = { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    checks.database = { ok: false, detail: (err as Error).message === "timeout" ? "timeout" : "unreachable" };
  }
  checks.blob = { ok: !!process.env.BLOB_READ_WRITE_TOKEN, detail: process.env.BLOB_READ_WRITE_TOKEN ? "configured" : "not configured (uploads degraded)" };
  checks.session = { ok: !!process.env.SESSION_SECRET, detail: process.env.SESSION_SECRET ? "configured" : "SESSION_SECRET missing" };
  const ready = checks.database.ok && checks.session.ok;
  return Response.json(
    { status: ready ? "ready" : "not_ready", checks, time: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
