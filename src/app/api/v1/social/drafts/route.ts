import { envelopeResponse } from "@/server/core";
import { requireRole } from "@/server/auth";
import { generateDrafts, listDrafts, STYLE_LABEL, type DraftRow } from "@/server/social";

// Social drafts (staff cookie).
//   GET  /api/v1/social/drafts?photo_id=12&status=draft,approved
//   POST /api/v1/social/drafts {photo_id}   → 3 caption styles + alt text (AI draft with template fallback)

const STATUSES: DraftRow["status"][] = ["draft", "approved", "rejected", "published"];

export async function GET(request: Request) {
  return envelopeResponse(async () => {
    await requireRole("photographer", "organizer");
    const sp = new URL(request.url).searchParams;
    const photoId = Number(sp.get("photo_id")) || undefined;
    const statuses = sp.get("status")?.split(",").filter((s): s is DraftRow["status"] => (STATUSES as string[]).includes(s));
    const drafts = await listDrafts({ photoId, statuses: statuses?.length ? statuses : undefined });
    return {
      message: `${drafts.length} drafts`,
      data: { drafts: drafts.map((d) => ({ ...d, pathname: undefined, style_label: STYLE_LABEL[d.style] })) },
      fallbackText: drafts.map((d) => `#${d.id} [${d.status}] ${STYLE_LABEL[d.style]}: ${d.proposed_text}`).join("\n") || "No drafts.",
    };
  });
}

export async function POST(request: Request) {
  return envelopeResponse(async () => {
    const staff = await requireRole("photographer", "organizer");
    const body = await request.json().catch(() => ({}));
    const { data, receipt } = await generateDrafts(staff, body);
    return {
      message: data.generator === "llm" ? "Drafted 3 captions (advisory AI draft). A human must approve." : "Drafted 3 captions from templates. A human must approve.",
      data: { ...data, receipt },
      warnings: data.warning ? [data.warning] : [],
      actions: data.ids.map((id) => ({ id: `approve_${id}`, label: `Approve draft #${id}`, requires_human_confirmation: true, href: `/ops/media#draft-${id}` })),
    };
  });
}
