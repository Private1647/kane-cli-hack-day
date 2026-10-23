import { requireRole } from "@/server/auth";
import { envelopeResponse } from "@/server/core";
import { listIntegrations } from "@/server/ops";

// GET /api/v1/ops/integrations/health   organizer / mentor (staff cookie)
// The last recorded state of each external integration (Slack, AI gateway,
// Blob, GitHub…), as /ops/integrations shows it. Read-only.

export async function GET() {
  return envelopeResponse(async () => {
    await requireRole("organizer", "mentor");
    const rows = await listIntegrations();
    const bad = rows.filter((r) => r.status !== "ok" && r.status !== "unknown");
    return {
      status: bad.length ? "partial" : "ok",
      message: bad.length ? `${bad.length} integration${bad.length === 1 ? "" : "s"} not OK.` : "All recorded integrations OK.",
      data: rows,
      fallbackText: rows.map((r) => `${r.system}: ${r.status}`).join("\n"),
    };
  });
}
