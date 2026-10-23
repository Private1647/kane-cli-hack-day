"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmByTyping } from "@/components/forms/fields";
import DeckSlide from "@/components/deck/DeckSlide";
import { GROUNDS, GROUND_LABEL, GROUND_STYLE, SLIDE_TYPES, SLIDE_TYPE_LABEL, blankSlide, newSlideId, normalizeDeck, type Deck, type Slide } from "@/components/deck/model";
import type { PublicStory } from "@/components/ship-templates/model";
import StatusPill from "@/components/ui/StatusPill";
import { publishDeckAction, requestRenderAction, saveDeckAction } from "../actions";
import { Field, IconButton, ListField, Panel, ResultLine, Select, newKey } from "../fields";

// The deck editor (T-DECK-03/04/05/08): edit each slide, change its type and
// ground, insert / remove / duplicate / reorder, theme options, reset to the
// default kane-ship-5 deck, JSON import/export, version history, optimistic
// concurrency on save, publish a version, and export requests with honest
// status. Evidence slides render the story's proof; they can't be edited here.

export type DeckVersionSummary = { version: number; status: string; createdAt: string; deck: Deck };
export type RenderSummary = { id: number; kind: string; status: string; note: string; url: string | null; sourceVersion: string };

type Msg = { ok: boolean; message: string; receipt?: string } | null;

export default function DeckEditor({
  slug,
  initialDeck,
  defaultDeck,
  initialVersion,
  story,
  qrSvg,
  versions,
  published,
  renders,
  canWrite,
  shipPublished,
}: {
  slug: string;
  initialDeck: Deck;
  defaultDeck: Deck;
  initialVersion: number;
  story: PublicStory;
  qrSvg: string;
  versions: DeckVersionSummary[];
  published: { version: number; deckVersion: number | null } | null;
  renders: RenderSummary[];
  canWrite: boolean;
  shipPublished: boolean;
}) {
  const [deck, setDeck] = useState<Deck>(initialDeck);
  const [version, setVersion] = useState(initialVersion);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("edit");
  const [msg, setMsg] = useState<Msg>(null);
  const [pubMsg, setPubMsg] = useState<Msg>(null);
  const [renderMsg, setRenderMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const slide = deck.slides[Math.min(sel, deck.slides.length - 1)];
  const setSlides = (slides: Slide[], why = "edit") => {
    setDeck((d) => ({ ...d, slides }));
    setDirty(true);
    setReason(why);
  };
  const patch = (p: Partial<Slide>) => setSlides(deck.slides.map((s, i) => (i === sel ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= deck.slides.length) return;
    const next = [...deck.slides];
    [next[i], next[j]] = [next[j], next[i]];
    setSlides(next);
    setSel(j);
  };
  const insert = () => {
    const next = [...deck.slides];
    next.splice(sel + 1, 0, blankSlide());
    setSlides(next);
    setSel(sel + 1);
  };
  const duplicate = (i: number) => {
    const next = [...deck.slides];
    next.splice(i + 1, 0, { ...structuredClone(deck.slides[i]), id: newSlideId() });
    setSlides(next);
    setSel(i + 1);
  };
  const remove = (i: number) => {
    if (deck.slides.length === 1) return;
    setSlides(deck.slides.filter((_, j) => j !== i));
    setSel(Math.max(0, i - 1));
  };

  const save = () =>
    start(async () => {
      const r = await saveDeckAction(slug, deck, version, reason, newKey());
      if (r.ok) {
        setVersion(r.data.version);
        setDirty(false);
        setMsg({ ok: true, message: `Saved deck version ${r.data.version}.`, receipt: r.receipt?.id });
      } else setMsg({ ok: false, message: r.error.message });
    });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-deck${version ? `-v${version}` : ""}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (file: File) => {
    try {
      const next = normalizeDeck(JSON.parse(await file.text()));
      setDeck(next);
      setSel(0);
      setDirty(true);
      setReason("import");
      setMsg({ ok: true, message: `Imported ${next.slides.length} slides. Review, then save as a new version.` });
    } catch (e) {
      const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
      setMsg({ ok: false, message: issues ? `That deck.json doesn't fit the schema: ${issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` : "That file isn't valid JSON." });
    }
  };

  const publish = (phrase: string, v: number) =>
    start(async () => {
      const r = await publishDeckAction(slug, v, phrase, newKey());
      setPubMsg(r.ok ? { ok: true, message: `Deck v${r.data.deckVersion} is public at /ship/${slug}/deck.`, receipt: r.receipt?.id } : { ok: false, message: r.error.message });
    });

  const render = (format: "pdf" | "pptx") =>
    start(async () => {
      const r = await requestRenderAction(slug, format, version || undefined);
      setRenderMsg(r.ok ? { ok: r.data.errorCode === "browser_print", message: r.data.note, receipt: r.receipt?.id } : { ok: false, message: r.error.message });
    });

  return (
    <div className="container-page pb-32">
      <fieldset disabled={!canWrite} className="min-w-0">
        <Panel
          eyebrow="Deck · kane-ship-5@1.0.0"
          title="Slides"
          intro="Five default scenes from your story: Creation, See it work, Harness, Proof, Outcome. The Proof slide always shows your story's reviewed claims."
          aside={
            <div className="flex flex-wrap gap-2">
              <a href={`/ship/${slug}/deck`} className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-sm text-bright hover:border-lime hover:text-lime">
                Public presenter →
              </a>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
            {/* Outline */}
            <ol aria-label="Slide outline" className="space-y-2">
              {deck.slides.map((s, i) => (
                <li key={s.id} className={`border ${i === sel ? "border-lime" : "border-hairline"}`}>
                  <button type="button" onClick={() => setSel(i)} aria-current={i === sel ? "true" : undefined} className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left">
                    <span aria-hidden="true" className="size-4 shrink-0 border border-hairline" style={{ background: GROUND_STYLE[s.ground].bg }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-plex text-sm text-bright">
                        {i + 1}. {s.headline || "(no headline)"}
                      </span>
                      <span className="block font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">{SLIDE_TYPE_LABEL[s.type]}</span>
                    </span>
                  </button>
                  {i === sel && (
                    <div className="flex flex-wrap gap-1 border-t border-hairline p-1">
                      <IconButton label="Move slide up" onClick={() => move(i, -1)} disabled={i === 0}>
                        ↑
                      </IconButton>
                      <IconButton label="Move slide down" onClick={() => move(i, 1)} disabled={i === deck.slides.length - 1}>
                        ↓
                      </IconButton>
                      <IconButton label="Duplicate slide" onClick={() => duplicate(i)} disabled={deck.slides.length >= 20}>
                        ⧉
                      </IconButton>
                      <IconButton label="Remove slide" onClick={() => remove(i)} disabled={deck.slides.length === 1}>
                        ✕
                      </IconButton>
                    </div>
                  )}
                </li>
              ))}
              <li>
                <button type="button" onClick={insert} disabled={deck.slides.length >= 20} className="flex min-h-11 w-full items-center justify-center border border-dashed border-hairline font-plex text-sm text-lightgray hover:border-lime hover:text-lime disabled:opacity-40">
                  + Insert slide after {sel + 1}
                </button>
              </li>
            </ol>

            {/* Preview + fields */}
            <div className="min-w-0 space-y-6">
              <div className="border border-hairline">
                <DeckSlide slide={slide} story={story} theme={deck.theme} index={sel} total={deck.slides.length} qrSvg={qrSvg} />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Select label="Slide type" value={slide.type} options={SLIDE_TYPES.map((t) => ({ value: t, label: SLIDE_TYPE_LABEL[t] }))} onChange={(v) => patch({ type: v })} />
                <fieldset>
                  <legend className="mb-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">Ground</legend>
                  <div role="radiogroup" aria-label="Slide ground" className="flex flex-wrap gap-1">
                    {GROUNDS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={slide.ground === g}
                        onClick={() => patch({ ground: g })}
                        className={`inline-flex min-h-11 items-center gap-2 border px-3 font-plex text-xs ${slide.ground === g ? "border-lime text-lime" : "border-hairline text-lightgray hover:text-bright"}`}
                      >
                        <span aria-hidden="true" className="size-3 border border-hairline" style={{ background: GROUND_STYLE[g].bg }} />
                        {GROUND_LABEL[g]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Field label="Eyebrow" value={slide.eyebrow} max={60} onChange={(v) => patch({ eyebrow: v })} />
                <Field label="Headline" value={slide.headline} max={140} onChange={(v) => patch({ headline: v })} />
                <div className="md:col-span-2">
                  <Field label="Body" multiline value={slide.body} max={600} onChange={(v) => patch({ body: v })} />
                </div>
                <div className="md:col-span-2">
                  <ListField
                    label={slide.type === "evidence" ? "Not yet verified (gaps)" : slide.type === "diagram" ? "Stages" : "Items"}
                    values={slide.items}
                    max={6}
                    itemMax={200}
                    onChange={(v) => patch({ items: v })}
                  />
                </div>
                {slide.type !== "evidence" && slide.type !== "outcome" && slide.type !== "diagram" && (
                  <>
                    <Field
                      label="Media (https:// or /path, real captures only)"
                      value={slide.media?.src ?? ""}
                      max={500}
                      onChange={(v) => patch({ media: v ? { src: v, alt: slide.media?.alt ?? "", label: slide.media?.label ?? "screenshot" } : null })}
                    />
                    <Field label="Media alt text" value={slide.media?.alt ?? ""} max={200} disabled={!slide.media} onChange={(v) => slide.media && patch({ media: { ...slide.media, alt: v } })} />
                  </>
                )}
                <div className="md:col-span-2">
                  <Field label="Speaker notes" multiline value={slide.notes} max={1000} onChange={(v) => patch({ notes: v })} />
                </div>
              </div>
              {slide.type === "evidence" && (
                <p className="border-l-2 border-hairline pl-3 font-plex text-xs text-lightgray">
                  Evidence comes from your story&apos;s proof claims ({story.proof.length}) and keeps the labels the server gave them. Edit claims in the Story tab.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Theme" title="Look" intro="Tokens stay in the site theme. Lime is the accent; verified evidence is always teal.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Select label="Density" value={deck.theme.density} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} onChange={(v) => { setDeck({ ...deck, theme: { ...deck.theme, density: v } }); setDirty(true); }} />
            <Select label="Headline font" value={deck.theme.headline_font} options={[{ value: "display", label: "Inter Tight" }, { value: "dots", label: "Doto dot-matrix" }]} onChange={(v) => { setDeck({ ...deck, theme: { ...deck.theme, headline_font: v } }); setDirty(true); }} />
            <Select label="Ship Page QR on outcome" value={deck.theme.show_qr ? "yes" : "no"} options={[{ value: "yes", label: "Show" }, { value: "no", label: "Hide" }]} onChange={(v) => { setDeck({ ...deck, theme: { ...deck.theme, show_qr: v === "yes" } }); setDirty(true); }} />
          </div>
        </Panel>

        <Panel eyebrow="Files" title="Reset, import, export">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Replace the editor with the default five slides generated from your story? Saved versions are kept.")) {
                  setDeck(structuredClone(defaultDeck));
                  setSel(0);
                  setDirty(true);
                  setReason("reset");
                  setMsg({ ok: true, message: "Reset to the default deck. Save to keep it." });
                }
              }}
              className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime"
            >
              Reset to default
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
              Import deck.json
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            <button type="button" onClick={exportJson} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
              Export deck.json
            </button>
            {version > 0 && (
              <a href={`/studio/${slug}/deck/export?v=${version}`} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
                Download offline HTML (v{version})
              </a>
            )}
          </div>
        </Panel>
      </fieldset>

      <Panel eyebrow="Exports" title="PDF and PPTX" intro="Exports never block your submission. The HTML deck always works.">
        <ul className="space-y-3 font-plex text-sm">
          <li className="flex flex-wrap items-center gap-3">
            <StatusPill tone="unverified">Browser print</StatusPill>
            <span className="text-lightgray">PDF: open the presenter in print mode and choose Save as PDF (one slide per page).</span>
            <a href={published ? `/ship/${slug}/deck?print=1` : `/studio/${slug}/deck/export?v=${version}`} className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
              {published ? "Open print view →" : "Print the offline copy →"}
            </a>
            {canWrite && version > 0 && (
              <button type="button" disabled={pending} onClick={() => render("pdf")} className="inline-flex min-h-11 items-center border border-hairline px-3 text-lightgray hover:border-lime hover:text-lime">
                Record PDF export
              </button>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <StatusPill tone="unverified">Unavailable</StatusPill>
            <span className="text-lightgray">PPTX: no converter has been verified to produce editable slides, so it isn&apos;t offered.</span>
            {canWrite && version > 0 && (
              <button type="button" disabled={pending} onClick={() => render("pptx")} className="inline-flex min-h-11 items-center border border-hairline px-3 text-lightgray hover:border-lime hover:text-lime">
                Check again
              </button>
            )}
          </li>
        </ul>
        {renderMsg && (
          <div className="mt-4">
            <ResultLine {...renderMsg} />
          </div>
        )}
        {renders.length > 0 && (
          <details className="mt-4">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-plex text-xs text-lightgray hover:text-bright">Export log ({renders.length})</summary>
            <ul className="mt-2 space-y-1 font-plex text-xs text-lightgray">
              {renders.map((r) => (
                <li key={r.id}>
                  R-{r.id} · {r.kind} · {r.sourceVersion} · {r.status} · {r.note}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      {versions.length > 0 && (
        <Panel eyebrow="History" title="Deck versions" intro="Versions are immutable. Load one to edit it as a new version; publish any saved version.">
          <ul className="divide-y divide-hairline border-y border-hairline">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="font-plex text-sm text-bright">
                  v{v.version} <span className="text-lightgray">· {new Date(v.createdAt).toLocaleString()} · {v.deck.slides.length} slides</span>
                  {v.status === "published" && <span className="ml-2 font-pixel text-[10px] tracking-[0.2em] text-lime uppercase">Public</span>}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeck(structuredClone(v.deck));
                      setSel(0);
                      setDirty(true);
                      setReason(`restore v${v.version}`);
                      setMsg({ ok: true, message: `Loaded v${v.version}. Save to make it the latest.` });
                    }}
                    className="inline-flex min-h-11 items-center px-3 font-plex text-sm text-lightgray underline-offset-4 hover:text-lime hover:underline"
                  >
                    Load
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {canWrite && (
        <Panel
          eyebrow="Publish"
          title="Publish a deck version"
          intro={
            shipPublished
              ? `Publishing pins one saved version (and your submission, if any) at /ship/${slug}/deck. ${published ? `Public now: deck v${published.deckVersion}.` : ""}`
              : "Publish your Ship Page story first. The deck shows its approved claims and credits."
          }
        >
          <PublishDeck version={version} disabled={!shipPublished || version === 0 || dirty || pending} onPublish={publish} />
          {dirty && <p className="mt-3 font-plex text-xs text-warning">! Save your changes first: publishing uses a saved version.</p>}
          {pubMsg && (
            <div className="mt-4">
              <ResultLine {...pubMsg} />
            </div>
          )}
        </Panel>
      )}

      {canWrite && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink/95 backdrop-blur">
          <div className="container-page flex flex-wrap items-center gap-3 py-3">
            <p className="font-plex text-xs text-lightgray">
              {version ? `Deck v${version}` : "Default deck (not saved)"}
              {dirty && <span className="ml-2 text-warning">· unsaved changes</span>}
            </p>
            <div className="min-w-0 flex-1">{msg && <ResultLine {...msg} />}</div>
            <button type="button" onClick={save} disabled={pending || (!dirty && version > 0)} className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? "Saving…" : "Save new version"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PublishDeck({ version, disabled, onPublish }: { version: number; disabled: boolean; onPublish: (phrase: string, v: number) => void }) {
  return (
    <form
      className="max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        onPublish(String(new FormData(e.currentTarget).get("confirm_phrase") ?? ""), version);
      }}
    >
      <ConfirmByTyping phrase="publish deck">
        {(matched) => (
          <button type="submit" disabled={!matched || disabled} className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-not-allowed disabled:opacity-50">
            Publish deck v{version || "—"}
          </button>
        )}
      </ConfirmByTyping>
    </form>
  );
}
