"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/forms/fields";

// Take a photo with the phone camera (or pick files), shrink it in the
// browser to ≤2048 px JPEG so it fits the upload limit, and post it to
// /api/v1/media. The file goes to private storage; nothing is public until
// people are identified, consent is checked and an organizer publishes.

const MAX_SIDE = 2048;

async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const q of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 3.8 * 1024 * 1024) return { blob, width, height };
  }
  throw new Error("Photo is too large even after shrinking.");
}

export default function Capture() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; duplicate: boolean }[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const out: { id: number; duplicate: boolean }[] = [];
    for (const [i, file] of [...files].entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const { blob, width, height } = await shrink(file);
        const fd = new FormData();
        fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        fd.set("width", String(width));
        fd.set("height", String(height));
        const res = await fetch("/api/v1/media", { method: "POST", body: fd });
        const env = (await res.json()) as { status: string; message: string; data: { id: number; duplicate: boolean } | null };
        if (env.status === "error" || !env.data) throw new Error(env.message);
        out.push(env.data);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    setDone((d) => [...out, ...d]);
    if (out.length === 1 && files.length === 1) router.push(`/photo/${out[0].id}`);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 bg-bright px-4 py-4 text-center font-plex text-sm text-ink transition-colors hover:bg-lime has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime">
          <span className="font-display text-lg font-semibold">Take a photo</span>
          <span className="text-xs">Opens the camera on a phone</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={(e) => upload(e.target.files)} />
        </label>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 border border-hairline px-4 py-4 text-center font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime">
          <span className="font-display text-lg font-semibold">Upload files</span>
          <span className="text-xs text-lightgray">JPEG, PNG or WebP, several at once</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={!!busy} onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      {busy && (
        <p role="status" className="font-plex text-sm text-bright">
          {busy}
        </p>
      )}
      <FormError message={error} />
      {done.length > 0 && !busy && (
        <p role="status" className="font-plex text-sm text-lightgray">
          Uploaded {done.length} photo{done.length === 1 ? "" : "s"}
          {done.some((d) => d.duplicate) ? " (some were already uploaded)" : ""}. Open each one below to identify people.
        </p>
      )}
    </div>
  );
}
