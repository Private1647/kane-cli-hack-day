import { query } from "@/lib/db";
import { envelopeResponse } from "@/server/core";
import { diagnoseHelp } from "@/server/help";
import { readMutation, requesterFor } from "../request";

// POST /api/v1/help/diagnose: docs-grounded suggestions before opening a
// ticket (help_diagnose). Signed-in only; advisory, never a substitute for a mentor.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const who = await requesterFor(req);
    const [team] = who.member.team_id ? await query<{ slug: string }>("select slug from teams where id = $1", [who.member.team_id]) : [];
    const d = await diagnoseHelp(await readMutation(req), { teamSlug: team?.slug ?? null });
    const top = d.suggestions[0];
    return {
      message: top ? `Try: ${top.title}. Still stuck? Open a ticket with help_create.` : "No match in the docs map. Open a ticket with help_create.",
      data: d,
      evidence: [{ kind: "docs_map", id: d.generator === "llm" ? `ranked:${d.model}` : "rules", confidence: "inferred" }],
      warnings: d.warning ? [d.warning] : [],
      uiType: "help_diagnosis",
      links: d.suggestions.flatMap((s) => s.links).slice(0, 6),
      actions: [{ id: "help_create", label: "Open a mentor ticket", requires_human_confirmation: false, tool: "help_create" }],
      fallbackText: d.suggestions.map((s) => `${s.title}: ${s.steps.join(" ")} (${s.links.map((l) => l.url).join(", ")})`).join("\n"),
    };
  });
}
