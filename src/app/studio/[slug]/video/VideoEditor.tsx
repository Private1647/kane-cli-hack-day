"use client";

import { upload } from "@vercel/blob/client";
import { useState, useTransition } from "react";
import { Toggle } from "@/components/forms/fields";
import StatusPill from "@/components/ui/StatusPill";
import { saveVideoAction } from "../actions";
import { Field, ResultLine, Select } from "../fields";

// The 60-second storyboard (T-VID-01/02): five timed scenes, each with real
// footage (an upload or a link), source timecodes, a caption and optional
// voiceover. Stills are allowed only as a montage that is labelled as such.
// Nothing here synthesises footage or a green run.

type Footage = { kind: "none" | "upload" | "url" | "screenshots"; url: string; object_key: string; label: string };
export type SceneState = { id: string; caption: string; voiceover: string; footage: Footage; source_in: string; source_out: string };
export type PlanState = { scenes: SceneState[]; fallback_montage: boolean; captions_reviewed: boolean };
export type SceneMeta = { id: string; start: number; end: number; title: string; hint: string };

const KINDS = [
  { value: "none", label: "No footage yet" },
  { value: "upload", label: "Upload a recording" },
  { value: "url", label: "Link (https://)" },
  { value: "screenshots", label: "Screenshot stills (montage)" },
] as const;

const tc = (s: number) => `00:${String(s).padStart(2, "0")}`;

export default function VideoEditor({ slug, initial, initialVersion, meta, canWrite }: { slug: string; initial: PlanState; initialVersion: number; meta: SceneMeta[]; canWrite: boolean }) {
  const [plan, setPlan] = useState<PlanState>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [msg, setMsg] = useState<{ ok: boolean; message: string; receipt?: string } | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setScene = (id: string, patch: Partial<SceneState>) => setPlan((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const doUpload = async (id: string, file: File) => {
    setUploading(id);
    setMsg(null);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const blob = await upload(`studio/${slug}/${id}.${ext}`, file, { access: "private", handleUploadUrl: `/studio/${slug}/video/upload`, contentType: file.type });
      setScene(id, { footage: { kind: file.type.startsWith("image/") ? "screenshots" : "upload", url: "", object_key: blob.pathname, label: file.name.slice(0, 120) } });
      setMsg({ ok: true, message: `Uploaded ${file.name}. Save the storyboard to keep it.` });
    } catch (e) {
      setMsg({ ok: false, message: `Upload failed: ${(e as Error).message || "try again"}. You can paste a link instead.` });
    } finally {
      setUploading(null);
    }
  };

  const save = () =>
    start(async () => {
      const r = await saveVideoAction(slug, plan, version);
      if (r.ok) {
        setVersion(r.data.version);
        setIssues(r.data.issues);
        setMsg({ ok: true, message: `Saved storyboard v${r.data.version}.`, receipt: r.receipt?.id });
      } else setMsg({ ok: false, message: r.error.message });
    });

  const stills = plan.scenes.some((s) => s.footage.kind === "screenshots");

  return (
    <div className="space-y-6">
      <ol className="space-y-4">
        {plan.scenes.map((s) => {
          const m = meta.find((x) => x.id === s.id)!;
          const src = s.footage.object_key ? `/studio/${slug}/media/${s.footage.object_key}` : s.footage.url;
          return (
            <li key={s.id} className="brackets border border-hairline p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-display text-xl text-bright">
                  <span className="mr-3 font-dots text-lg font-black text-lime">
                    {tc(m.start)}–{tc(m.end)}
                  </span>
                  {m.title}
                </p>
                <FootagePill kind={s.footage.kind} montage={plan.fallback_montage} />
              </div>
              <p className="mt-1 font-plex text-xs text-lightgray">{m.hint}</p>
              <fieldset disabled={!canWrite} className="mt-4 grid gap-4 md:grid-cols-2">
                <Select label="Footage" value={s.footage.kind} options={KINDS} onChange={(v) => setScene(s.id, { footage: { ...s.footage, kind: v } })} />
                {s.footage.kind === "url" ? (
                  <Field label="Footage link" value={s.footage.url} max={500} placeholder="https://… (Loom, YouTube, your repo)" onChange={(v) => setScene(s.id, { footage: { ...s.footage, url: v, object_key: "" } })} />
                ) : s.footage.kind === "upload" || s.footage.kind === "screenshots" ? (
                  <div>
                    <label className="mb-2 block font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase" htmlFor={`f-${s.id}`}>
                      {s.footage.object_key ? `Replace file (${s.footage.label})` : "Choose a file (video or image, up to 250 MB)"}
                    </label>
                    <input
                      id={`f-${s.id}`}
                      type="file"
                      accept={s.footage.kind === "screenshots" ? "image/png,image/jpeg,image/webp" : "video/mp4,video/webm,video/quicktime"}
                      disabled={uploading !== null}
                      onChange={(e) => e.target.files?.[0] && doUpload(s.id, e.target.files[0])}
                      className="block min-h-11 w-full font-plex text-sm text-lightgray file:mr-3 file:min-h-11 file:border file:border-hairline file:bg-surface file:px-3 file:font-plex file:text-sm file:text-bright"
                    />
                    {uploading === s.id && <p className="mt-2 font-plex text-xs text-warning">Uploading…</p>}
                  </div>
                ) : (
                  <div />
                )}
                <Field label="Source in" value={s.source_in} max={8} placeholder="mm:ss" onChange={(v) => setScene(s.id, { source_in: v })} />
                <Field label="Source out" value={s.source_out} max={8} placeholder="mm:ss" onChange={(v) => setScene(s.id, { source_out: v })} />
                <div className="md:col-span-2">
                  <Field label="Caption (on screen)" value={s.caption} max={160} onChange={(v) => setScene(s.id, { caption: v })} />
                </div>
                <div className="md:col-span-2">
                  <Field label="Voiceover (optional)" multiline rows={2} value={s.voiceover} max={400} onChange={(v) => setScene(s.id, { voiceover: v })} />
                </div>
              </fieldset>
              {src && (s.footage.kind === "upload" || s.footage.kind === "screenshots") && s.footage.object_key && (
                <div className="mt-4 max-w-md border border-hairline">
                  {s.footage.kind === "upload" ? (
                    <video src={src} controls preload="metadata" className="block aspect-video w-full bg-ink" aria-label={`${m.title} footage`} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- private team upload streamed through /studio/[slug]/media
                    <img src={src} alt={s.caption || `${m.title} still`} className="block aspect-video w-full object-cover" />
                  )}
                  {s.footage.kind === "screenshots" && <p className="border-t border-hairline px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-warning uppercase">Still image · screenshot walkthrough</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <fieldset disabled={!canWrite} className="space-y-2 border-t border-dashed border-hairline pt-6">
        <Toggle
          name="fallback_montage"
          label="Label this as a screenshot walkthrough"
          description="Required when any scene uses stills. The video will say it's a walkthrough of real screenshots, not a recording."
          checked={plan.fallback_montage}
          onChange={(v) => setPlan((p) => ({ ...p, fallback_montage: v }))}
        />
        <Toggle name="captions_reviewed" label="Our team reviewed the captions" checked={plan.captions_reviewed} onChange={(v) => setPlan((p) => ({ ...p, captions_reviewed: v }))} />
      </fieldset>
      {stills && !plan.fallback_montage && <p className="font-plex text-sm text-warning">! Some scenes use stills: turn on the walkthrough label before you share the video.</p>}

      {issues && issues.length > 0 && (
        <ul className="space-y-1 border-l-2 border-warning pl-3 font-plex text-sm text-bright">
          {issues.map((x, i) => (
            <li key={i}>! {x}</li>
          ))}
        </ul>
      )}
      {issues && issues.length === 0 && <p className="font-plex text-sm text-bright">Storyboard complete: every scene has a caption and real footage or labelled stills.</p>}

      {canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending || uploading !== null} className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink hover:bg-lime disabled:opacity-60">
            {pending ? "Saving…" : `Save storyboard${version ? ` (v${version + 1})` : ""}`}
          </button>
          <a
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ ...plan, timing: meta.map(({ id, start, end }) => ({ id, start, end })) }, null, 2))}`}
            download={`${slug}-storyboard.json`}
            className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime"
          >
            Export storyboard JSON
          </a>
        </div>
      )}
      {msg && <ResultLine {...msg} />}
    </div>
  );
}

function FootagePill({ kind, montage }: { kind: Footage["kind"]; montage: boolean }) {
  if (kind === "upload" || kind === "url") return <StatusPill tone="unverified">Real footage · team-supplied</StatusPill>;
  if (kind === "screenshots") return <StatusPill tone={montage ? "unverified" : "pending"}>{montage ? "Stills · labelled" : "Stills · needs label"}</StatusPill>;
  return <StatusPill tone="pending">Needs footage</StatusPill>;
}
