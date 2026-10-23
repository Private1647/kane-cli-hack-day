import { put } from "@vercel/blob";
import { notify } from "@/lib/notifications";
import { EVENT_PREFIX, hasExportToken } from "@/lib/photos";
import { getTeamBySlug } from "@/lib/teams";
import { importPipelinePhoto, type ImportOutcome } from "@/server/photos";

// The photo pipeline posts each tagged event photo here once (multipart):
//   file      the JPEG (the pipeline resizes to fit the 4.5 MB request limit)
//   key       stable id for the photo (content hash); re-sending is a no-op
//   teams     one or more team slugs the photo was matched to
//   people    optional P-codes of people the pipeline face-matched (suggestions only)
//   caption   optional, shown under the photo
//   width, height
//
// Consent gate (T-PHOTO-01): a photo reaches a gallery only when every
// suggested person and every current member of the team has said yes to
// photo publication. Anything else is stored privately and HELD for review
// in /ops/media ("held for review"), never published on a camera match alone.

export async function POST(request: Request) {
  if (!hasExportToken(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const key = String(form.get("key") ?? "");
  const slugs = [...new Set(form.getAll("teams").map(String))];
  if (!(file instanceof File) || !/^[\w-]{6,80}$/.test(key) || !slugs.length) {
    return Response.json({ error: "need file, key and at least one team" }, { status: 400 });
  }
  const caption = String(form.get("caption") ?? "").slice(0, 300) || undefined;
  const width = Number(form.get("width")) || undefined;
  const height = Number(form.get("height")) || undefined;
  const people = [...new Set(form.getAll("people").map(String))].filter((p) => /^P-\d{3,}$/i.test(p)).slice(0, 30);

  const results: Record<string, ImportOutcome> = {};
  for (const slug of slugs) {
    const team = await getTeamBySlug(slug);
    if (!team) {
      results[slug] = "unknown team";
      continue;
    }
    const pathname = `${EVENT_PREFIX}${slug}/${key}.jpg`;
    await put(pathname, file, { access: "private", contentType: file.type || "image/jpeg", allowOverwrite: true });
    const outcome = await importPipelinePhoto({ team: { id: team.id, slug }, photoKey: key, pathname, width, height, caption, people });
    if (outcome === "added") {
      await notify({
        teamId: team.id,
        kind: "photo",
        title: "New photo of your team",
        body: caption ?? "A photographer just caught you in action. See it in your gallery.",
        href: `/t/${slug}/photos`,
        imagePath: pathname,
      });
    }
    results[slug] = outcome;
  }
  return Response.json({ ok: true, results });
}
