"use client";

import { useId, useState, useTransition } from "react";
import { inputCls, Label } from "@/components/forms/fields";
import { setCustomHtmlAction } from "../actions";
import { ResultLine } from "../fields";

// Level-3 customisation (T-DECK-07): participant HTML/CSS, previewed only in
// a sandboxed iframe: sandbox="allow-scripts" without allow-same-origin gives
// it an opaque origin (no cookies, no storage, no access to this page), and
// the srcdoc carries a CSP that blocks all network, forms and navigation.
// If it crashes or misbehaves, "Restore default" clears it; public pages keep
// the default deck regardless.
//
// TODO(preview origin): serve previews from https://preview.kaneclihack.sh
// (separate registrable origin) once DNS + a preview deployment exist.

export default function CustomHtml({ slug, initial, srcDoc: initialDoc, canWrite }: { slug: string; initial: string; srcDoc: string; canWrite: boolean }) {
  const id = useId();
  const [html, setHtml] = useState(initial);
  const [doc, setDoc] = useState(initialDoc);
  const [frameKey, setFrameKey] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; message: string; receipt?: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (value: string) =>
    start(async () => {
      const r = await setCustomHtmlAction(slug, value);
      if (r.ok) {
        setMsg({ ok: true, message: r.data.cleared ? "Restored the default deck. Custom HTML removed." : "Saved. The preview below runs it in the sandbox.", receipt: r.receipt?.id });
        if (r.data.cleared) setHtml("");
        setDoc(wrap(value));
        setFrameKey((k) => k + 1);
      } else setMsg({ ok: false, message: r.error.message });
    });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={id} hint={`${new Blob([html]).size.toLocaleString()} / 200,000 bytes`}>
          Your HTML / CSS / JS
        </Label>
        <textarea
          id={id}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          spellCheck={false}
          disabled={!canWrite}
          placeholder={"<style>…</style>\n<section>…</section>"}
          className={`${inputCls} min-h-11 font-plex text-xs`}
        />
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => run(html)} className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime disabled:opacity-60">
            Save and preview in sandbox
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDoc(wrap(html));
              setFrameKey((k) => k + 1);
            }}
            className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime"
          >
            Preview without saving
          </button>
          <button type="button" disabled={pending} onClick={() => run("")} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            Restore default
          </button>
        </div>
      )}
      {msg && <ResultLine {...msg} />}
      <figure className="border border-hairline">
        <iframe
          key={frameKey}
          title="Custom deck preview (sandboxed)"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={doc}
          className="block aspect-video w-full bg-card"
        />
        <figcaption className="border-t border-hairline px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">
          Sandboxed preview · opaque origin · no network · studio only
        </figcaption>
      </figure>
    </div>
  );
}

// Must match sandboxDoc() in src/server/deck.ts.
function wrap(html: string) {
  if (!html.trim()) return `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;font:14px ui-monospace,monospace;color:#555;background:#f2f2f2">No custom HTML. The default deck is in use.</body></html>`;
  const csp = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
}
