import { put } from "@vercel/blob";
import { notify } from "@/lib/notifications";
import { EVENT_PREFIX, addEventPhoto, hasExportToken } from "@/lib/photos";
import { getTeamBySlug } from "@/lib/teams";

// The photo pipeline posts each tagged event photo here once (multipart):
//   file      the JPEG (the pipeline resizes to fit the 4.5 MB request limit)
//   key       stable id for the photo (content hash); re-sending is a no-op
//   teams     one or more team slugs the photo was matched to
//   caption   optional, shown under the photo
//   width, height
// It lands in each team's Photos tab and pings them in the hub.

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

  const results: Record<string, string> = {};
  for (const slug of slugs) {
    const team = await getTeamBySlug(slug);
    if (!team) {
      results[slug] = "unknown team";
      continue;
    }
    const pathname = `${EVENT_PREFIX}${slug}/${key}.jpg`;
    await put(pathname, file, { access: "private", contentType: file.type || "image/jpeg", allowOverwrite: true });
    const added = await addEventPhoto({ teamId: team.id, photoKey: key, pathname, width, height, caption });
    if (added) {
      await notify({
        teamId: team.id,
        kind: "photo",
        title: "New photo of your team",
        body: caption ?? "A photographer just caught you in action. See it in your gallery.",
        href: `/t/${slug}/photos`,
        imagePath: pathname,
      });
    }
    results[slug] = added ? "added" : "already there";
  }
  return Response.json({ ok: true, results });
}
