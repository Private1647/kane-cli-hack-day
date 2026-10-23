import { envelopeResponse, AppError } from "@/server/core";
import { requireRole } from "@/server/auth";
import { PHOTO_STATUSES, createStudioPhoto, listPhotos, type PhotoStatus } from "@/server/photos";

// Photographer studio API (staff cookie).
//   GET  /api/v1/media?status=identity_review,consent_checked   the media queue
//   POST /api/v1/media  multipart file (+ width, height)          capture → private Blob, status captured
// Same bytes uploaded twice return the same photo (content hash).

export async function GET(request: Request) {
  return envelopeResponse(async () => {
    await requireRole("photographer", "organizer");
    const raw = new URL(request.url).searchParams.get("status");
    const statuses = raw ? (raw.split(",").filter((s) => (PHOTO_STATUSES as string[]).includes(s)) as PhotoStatus[]) : undefined;
    const photos = await listPhotos({ statuses });
    return {
      message: `${photos.length} photos`,
      data: { photos: photos.map(({ pathname, ...p }) => ({ ...p, preview: `/photos/${pathname}` })) },
      fallbackText: photos.map((p) => `#${p.id} ${p.status} ${p.team_name ?? "no team"}`).join("\n") || "No photos.",
    };
  });
}

export async function POST(request: Request) {
  return envelopeResponse(async () => {
    const staff = await requireRole("photographer", "organizer");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", { userMessage: "Attach an image as `file`." });
    const { data, receipt } = await createStudioPhoto(staff, file, {
      width: Number(form?.get("width")) || undefined,
      height: Number(form?.get("height")) || undefined,
    });
    return {
      message: data.duplicate ? "Already uploaded; here is the same photo." : "Photo captured. Identify who is in it next.",
      data: { ...data, receipt },
      actions: [{ id: "identify", label: "Identify people", requires_human_confirmation: false, href: `/photo/${data.id}` }],
    };
  });
}
