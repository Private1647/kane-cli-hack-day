import { AppError, envelopeResponse } from "@/server/core";
import { ingestSignedUpload, listEvidence, projectFor, resolveCaller, storeEvidence, type EvidenceReceipt } from "@/server/kane";
import { MAX_DIRECT_BYTES } from "@/server/kane-evidence";

// POST /api/v1/kane/evidence: store one evidence file in private Blob.
//   multipart/form-data  file + kind (+ project_id, run_id, sha256, visibility); ≤ 4 MB
//   application/json     { pathname, name, kind, … } after a signed client upload
//                        (token from /api/v1/kane/evidence/upload); ≤ 50 MB
// Checks: type and size, magic bytes, executables, zip traversal/bombs, sha256
// match. Duplicates (same sha256 in the project) return the existing receipt.
// GET  /api/v1/kane/evidence: the project's evidence list (metadata only).

function envelopeFor(r: EvidenceReceipt) {
  const q = r.redaction_state === "quarantined";
  return {
    status: q ? ("needs_action" as const) : ("ok" as const),
    message: q
      ? `Evidence ${r.id} was quarantined: ${r.quarantine_reason}. Organizers can review it; it won't count as proof.`
      : r.deduped
        ? `Evidence ${r.id} was already stored (same sha256).`
        : `Stored evidence ${r.id} (sha256 ${r.sha256.slice(0, 12)}…).`,
    data: r,
    evidence: q ? [] : [{ kind: "evidence_artifact", id: r.id, confidence: "participant_reported" as const }],
    links: [{ label: "Open Proof tab", url: r.url }],
    uiType: "kane_run",
    fallbackText: `${r.id} ${q ? "QUARANTINED" : "stored"} sha256:${r.sha256}`,
  };
}

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_DIRECT_BYTES + 64 * 1024) {
        throw new AppError("VALIDATION_FAILED", { userMessage: "Files over 4 MB go through a signed upload (POST /api/v1/kane/evidence/upload)." });
      }
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", { userMessage: "Attach the evidence as `file`." });
      const meta = {
        kind: form.get("kind"),
        project_id: form.get("project_id") || undefined,
        run_id: form.get("run_id") || undefined,
        sha256: form.get("sha256") || undefined,
        visibility: form.get("visibility") || undefined,
      };
      const r = await storeEvidence(caller, meta, { name: file.name, type: file.type || null, bytes: Buffer.from(await file.arrayBuffer()) });
      return envelopeFor(r);
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.pathname !== "string" || typeof body.name !== "string") {
      throw new AppError("VALIDATION_FAILED", { userMessage: "Send multipart with `file`, or JSON with the signed upload's `pathname` and `name`." });
    }
    const { pathname, name, ...meta } = body;
    const r = await ingestSignedUpload(caller, meta, pathname as string, name as string);
    return envelopeFor(r);
  });
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const pid = Number(new URL(req.url).searchParams.get("project_id")) || null;
    const project = await projectFor(caller, pid, { read: true });
    const rows = await listEvidence(project.id);
    const visible = caller.kind === "staff" && caller.staff.role !== "organizer" && caller.staff.role !== "admin" ? rows.filter((e) => e.visibility === "judges" || e.visibility === "public") : rows;
    return {
      message: `${visible.length} evidence file(s).`,
      data: {
        evidence: visible.map((e) => ({
          id: e.id,
          kind: e.kind,
          sha256: e.sha256,
          size_bytes: e.size_bytes,
          redaction_state: e.redaction_state,
          visibility: e.visibility,
          source_run_id: e.source_run_id,
          verified: !!e.verified_at,
          uploaded_at: new Date(e.uploaded_at).toISOString(),
          url: e.redaction_state === "quarantined" ? null : `/api/v1/kane/evidence/${e.id}`,
        })),
      },
    };
  });
}
