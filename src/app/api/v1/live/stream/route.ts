import { AppError, envelopeResponse, serverNow, sha256, toAppError } from "@/server/core";
import { isEnabled } from "@/lib/flags";
import { getLiveSnapshot, readFeed, requireOpsViewer, type LiveSnapshot } from "@/server/metrics";

// GET /api/v1/live/stream: Server-Sent Events for /live (T-LIVE-06).
//
//   event: snapshot  id: <feed cursor>  data: LiveSnapshot   (on connect, then on change)
//   event: feed      id: <live_feed id> data: FeedItem       (new public items; drives the proof toast)
//   event: ping                         data: { server_time } (heartbeat every 15s)
//   event: degraded                     data: { state }       (snapshot unreadable; client holds last values)
//
// Resume: the browser's EventSource resends the last `id` as Last-Event-ID; we
// replay feed items after it, then send a fresh snapshot (reconcile). Each
// connection lives ~4 minutes, then closes cleanly so a function never runs
// past maxDuration; the client reconnects with Last-Event-ID automatically.
// Node runtime (not Edge). Behind the `live_sse` flag: when off, 503 and /live
// falls back to polling /api/v1/live/metrics?board=1.

export const runtime = "nodejs";
export const maxDuration = 300;

const TICK_MS = 5_000;
const HEARTBEAT_MS = 15_000;
const LIFETIME_MS = 240_000;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Hash of what the TV renders, ignoring the clock, so we only send real changes. */
const fingerprint = (s: LiveSnapshot) => sha256(JSON.stringify({ ...s, server_time: null }));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ops = url.searchParams.get("ops") === "1";
  try {
    if (!(await isEnabled("live_sse"))) throw new AppError("FEATURE_DISABLED", { details: { flag: "live_sse", fallback: "/api/v1/live/metrics?board=1" } });
    if (ops) await requireOpsViewer();
  } catch (e) {
    const err = toAppError(e);
    return envelopeResponse(async () => {
      throw err;
    });
  }

  const resumeFrom = Number(req.headers.get("last-event-id") ?? url.searchParams.get("lastEventId") ?? 0) || 0;
  const enc = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          open = false;
        }
      };
      const event = (name: string, data: unknown, id?: number | string) =>
        send(`${id != null ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

      const started = Date.now(); // connection lifetime only; never a deadline decision
      let lastBeat = started;
      let lastPrint = "";
      let cursor = resumeFrom;

      send(`retry: 5000\n: kane hack os live stream\n\n`);

      // Replay what the client missed, oldest first.
      if (resumeFrom > 0) {
        try {
          const missed = await readFeed({ afterId: resumeFrom, limit: 50 });
          for (const item of missed.reverse()) {
            event("feed", item, item.id);
            cursor = Math.max(cursor, item.id);
          }
        } catch (err) {
          console.error("[live/stream] replay failed", err);
        }
      }

      while (open && !signal.aborted && Date.now() - started < LIFETIME_MS) {
        try {
          const snap = await getLiveSnapshot({ ops });
          // New items since the last tick go out individually (for the toast).
          if (cursor > 0 && snap.feed_cursor > cursor) {
            for (const item of [...snap.feed].reverse()) if (item.id > cursor) event("feed", item, item.id);
          }
          cursor = Math.max(cursor, snap.feed_cursor);
          const print = fingerprint(snap);
          if (print !== lastPrint) {
            event("snapshot", snap, cursor);
            lastPrint = print;
            lastBeat = Date.now();
          }
        } catch (err) {
          console.error("[live/stream] snapshot failed", err);
          event("degraded", { state: "offline", detail: "Live data unreadable; holding last values." });
        }
        if (Date.now() - lastBeat >= HEARTBEAT_MS) {
          const now = await serverNow().catch(() => null);
          event("ping", { server_time: now ? now.toISOString() : null });
          lastBeat = Date.now();
        }
        await sleep(TICK_MS, signal);
      }
      open = false;
      try {
        controller.close();
      } catch {
        /* already closed by the client */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
