import { envelopeResponse } from "@/server/core";
import { getLiveSnapshot, readMetrics, requireOpsViewer } from "@/server/metrics";
import { METRIC_DEFINITION_VERSION } from "@/components/live/definitions";

// GET /api/v1/live/metrics → EventMetrics { metrics, as_of, freshness_state }
// (openapi.yaml). Public, verified aggregates only; `?ops=1` adds the staff-only
// metrics for organizers and mentors. `?board=1` also returns the whole TV
// snapshot, which is what /live polls when the SSE stream is unavailable and
// reconciles against after a reconnect.
//
// Unknown values are null (render "—"), never 0. On an outage the projection
// keeps its last values and as_of, and freshness_state says delayed/stale/offline.


export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const url = new URL(req.url);
    const ops = url.searchParams.get("ops") === "1";
    if (ops) await requireOpsViewer();
    const board = url.searchParams.get("board") === "1" ? await getLiveSnapshot({ ops }) : null;
    const m = board
      ? { metrics: board.metrics, as_of: board.as_of, freshness_state: board.freshness_state, demo_shown: board.demo_shown }
      : await readMetrics({ ops });
    const values = Object.values(m.metrics).filter((v) => v != null);
    const shown = values.filter((v) => v.value != null).length;
    return {
      status: m.freshness_state === "fresh" ? "ok" : "partial",
      message:
        m.freshness_state === "fresh"
          ? `${shown} live metrics, fresh.`
          : `${shown} live metrics, ${m.freshness_state}; values are held from ${m.as_of ?? "never"}, not reset.`,
      data: {
        metrics: m.metrics,
        as_of: m.as_of,
        freshness_state: m.freshness_state,
        definition_version: METRIC_DEFINITION_VERSION,
        demo_data: m.demo_shown,
        ...(board ? { board } : {}),
      },
      freshness: m.as_of ? { as_of: m.as_of, state: m.freshness_state, source: "live_metrics projection" } : null,
      warnings: m.demo_shown ? ["Includes illustrative demo data (staging only)."] : [],
      links: [{ label: "Mission Control", url: "/live" }],
      fallbackText: values.map((v) => `${v.name}: ${v.value ?? "unknown"}`).join("; ") || "No live metrics yet.",
    };
  });
}
