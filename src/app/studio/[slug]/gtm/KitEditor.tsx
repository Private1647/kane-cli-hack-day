"use client";

import { useState, useTransition, type ReactNode } from "react";
import CopyField from "@/components/ui/CopyField";
import StatusPill from "@/components/ui/StatusPill";
import { approveKitAction, generateKitAction, saveKitAction } from "../actions";
import { Field, ResultLine, newKey } from "../fields";

// The GTM kit (T-GTM-01/03): drafted copy with copy buttons, hand edits, the
// guard checks, and team approval. Approval never posts anything; it records
// that the team signed off on this exact text.

export type KitDraft = { x_post: string; thread: string[]; readme: string; alt_text: string; og_title: string; og_description: string; pitch: string };
export type KitView = {
  id: number | null;
  storyVersion: number;
  draft: KitDraft;
  generator: "llm" | "rules" | "human";
  model: string | null;
  status: "draft" | "approved" | "superseded";
  approvedBy: string | null;
  approvedAt: string | null;
  checks: { field: string; level: "block" | "warn"; message: string }[];
  shareable: boolean;
  shipUrl: string | null;
};

const GEN_LABEL = { llm: "Advisory draft (AI)", rules: "Rule-based draft (template)", human: "Edited by your team" } as const;

export default function KitEditor({ slug, kit, canWrite }: { slug: string; kit: KitView; canWrite: boolean }) {
  const [draft, setDraft] = useState<KitDraft>(kit.draft);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string; receipt?: string } | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: true; data: KitView & { warning?: string }; receipt?: { id: string } } | { ok: false; error: { message: string } }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setDraft(r.data.draft);
        setEditing(false);
        setMsg({ ok: true, message: r.data.warning ? `${done} ${r.data.warning}` : done, receipt: r.receipt?.id });
      } else setMsg({ ok: false, message: r.error.message });
    });

  const checksFor = (field: string) => kit.checks.filter((c) => c.field === field || c.field.startsWith(`${field}.`));
  const len = (s: string) => [...s].length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone="unverified">{GEN_LABEL[kit.generator]}</StatusPill>
        {kit.status === "approved" ? (
          <span className="border border-hairline px-2 py-0.5 font-pixel text-[10px] tracking-[0.18em] text-bright uppercase">✓ Approved by {kit.approvedBy ?? "team"}</span>
        ) : (
          <StatusPill tone="pending">Awaiting team approval</StatusPill>
        )}
        <span className="font-plex text-xs text-lightgray">From story v{kit.storyVersion}</span>
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => act(() => generateKitAction(slug, newKey()), "Drafted a new kit.")} className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime disabled:opacity-60">
            {pending ? "Working…" : kit.id ? "Regenerate from story" : "Draft the kit"}
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            {editing ? "Stop editing" : "Edit text"}
          </button>
          {editing && (
            <button type="button" disabled={pending} onClick={() => act(() => saveKitAction(slug, draft), "Saved your edits.")} className="inline-flex min-h-11 items-center border border-lime px-4 font-plex text-sm text-lime hover:bg-lime-deep">
              Save edits
            </button>
          )}
          <button
            type="button"
            disabled={pending || !kit.id || !kit.shareable || kit.status === "approved" || editing}
            onClick={() => act(() => approveKitAction(slug), "Approved. Copy and post it yourself; nothing is posted automatically.")}
            className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime disabled:opacity-40"
            title={!kit.shipUrl ? "Publish the Ship Page first" : undefined}
          >
            Approve for sharing
          </button>
        </div>
      )}
      {!kit.shipUrl && <p className="font-plex text-sm text-warning">! Your Ship Page isn&apos;t published, so links to it read “[Ship Page: publish it first]” and the kit can&apos;t be approved.</p>}
      {msg && <ResultLine {...msg} />}

      <Piece title="X post" count={`${len(draft.x_post)}/280`} checks={checksFor("x_post")}>
        {editing ? <Field label="X post" multiline rows={5} value={draft.x_post} max={400} onChange={(v) => setDraft({ ...draft, x_post: v })} /> : <CopyField value={draft.x_post} />}
      </Piece>

      <Piece title="Thread (4 posts)" checks={checksFor("thread")}>
        <ol className="space-y-3">
          {draft.thread.map((t, i) => (
            <li key={i}>
              {editing ? (
                <Field label={`Post ${i + 1} (${len(t)}/280)`} multiline rows={3} value={t} max={400} onChange={(v) => setDraft({ ...draft, thread: draft.thread.map((x, j) => (j === i ? v : x)) })} />
              ) : (
                <>
                  <p className="mb-1 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">
                    {i + 1}/4 · {len(t)}/280
                  </p>
                  <CopyField value={t} />
                </>
              )}
            </li>
          ))}
        </ol>
      </Piece>

      <Piece title="README excerpt" checks={checksFor("readme")}>
        {editing ? <Field label="README (Markdown)" multiline rows={14} value={draft.readme} max={4000} onChange={(v) => setDraft({ ...draft, readme: v })} /> : <CopyField value={draft.readme} />}
      </Piece>

      <div className="grid gap-8 md:grid-cols-2">
        <Piece title="Alt text" checks={checksFor("alt_text")}>
          {editing ? <Field label="Alt text" multiline value={draft.alt_text} max={400} onChange={(v) => setDraft({ ...draft, alt_text: v })} /> : <CopyField value={draft.alt_text} />}
        </Piece>
        <Piece title="Elevator pitch" checks={checksFor("pitch")}>
          {editing ? <Field label="Pitch" multiline value={draft.pitch} max={400} onChange={(v) => setDraft({ ...draft, pitch: v })} /> : <CopyField value={draft.pitch} />}
        </Piece>
        <Piece title="OG title" count={`${draft.og_title.length}/60`} checks={checksFor("og_title")}>
          {editing ? <Field label="OG title" value={draft.og_title} max={90} onChange={(v) => setDraft({ ...draft, og_title: v })} /> : <CopyField value={draft.og_title} />}
        </Piece>
        <Piece title="OG description" checks={checksFor("og_description")}>
          {editing ? <Field label="OG description" multiline value={draft.og_description} max={220} onChange={(v) => setDraft({ ...draft, og_description: v })} /> : <CopyField value={draft.og_description} />}
        </Piece>
      </div>
    </div>
  );
}

function Piece({ title, count, checks, children }: { title: string; count?: string; checks: KitView["checks"]; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-bright">{title}</h3>
        {count && <span className="font-plex text-xs text-lightgray">{count}</span>}
      </div>
      {children}
      {checks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {checks.map((c, i) => (
            <li key={i} className={`font-plex text-xs ${c.level === "block" ? "text-danger" : "text-warning"}`}>
              {c.level === "block" ? "✕ " : "! "}
              {c.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
