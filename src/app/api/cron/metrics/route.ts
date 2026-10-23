import { timingSafeEqual } from "node:crypto";
import { AppError, envelopeResponse } from "@/server/core";
import { runProjectionJob } from "@/server/metrics";

// Vercel Cron → recompute the live metric projection and feed (T-LIVE-07).
// Schedule "* * * * *" (Vercel's finest grain); /live also refreshes lazily
// when the projection is older than 45s, so a late cron only shows as DELAYED.
// Auth: `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically).

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    if (!authorized(req)) throw new AppError("UNAUTHENTICATED", { userMessage: "Cron secret required." });
    const { data, receipt } = await runProjectionJob();
    return {
      status: data.ran && data.failed.length ? "partial" : "ok",
      message: data.ran
        ? `Projected ${data.written.length} metrics${data.failed.length ? `, ${data.failed.length} held at their last value` : ""}.`
        : "Another projection is running; skipped.",
      data: { ...data, receipt },
      warnings: data.failed.map((f) => `${f.name}: ${f.error} (previous value held)`),
    };
  });
}
