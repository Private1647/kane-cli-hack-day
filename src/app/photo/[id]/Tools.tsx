"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { FormError, Label, inputCls } from "@/components/forms/fields";
import type { LookupHit } from "@/server/photos";
import { identifyAction, lookupAction, type PhotoState } from "../actions";

type Action = (prev: PhotoState, form: FormData) => Promise<PhotoState>;

const btn = "inline-flex min-h-11 items-center justify-center px-4 font-plex text-sm transition-colors disabled:opacity-50";
export const primaryBtn = `${btn} bg-bright text-ink hover:bg-lime`;
export const secondaryBtn = `${btn} border border-hairline text-bright hover:border-lime hover:text-lime`;

function Result({ state }: { state: PhotoState }) {
  return (
    <>
      <FormError message={state?.error} />
      {state?.problems && (
        <ul className="list-disc space-y-1 pl-5 font-plex text-xs text-warning">
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {state?.ok && (
        <p role="status" className="font-plex text-xs text-bright">
          {state.ok}
        </p>
      )}
    </>
  );
}

/** One button (plus optional fields) bound to a photo action, with its result inline. */
export function ActionForm({
  action,
  hidden,
  children,
  submit,
  primary = false,
}: {
  action: Action;
  hidden: Record<string, string | number>;
  children?: ReactNode;
  submit: string;
  primary?: boolean;
}) {
  const [state, run, pending] = useActionState<PhotoState, FormData>(action, null);
  return (
    <form action={run} className="space-y-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <button type="submit" disabled={pending} className={primary ? primaryBtn : secondaryBtn}>
        {pending ? "Working…" : submit}
      </button>
      <Result state={state} />
    </form>
  );
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Identify a person: scan their badge QR with the camera (BarcodeDetector,
 * where the browser has it), type or scan into the box (a hardware scanner
 * types too), or search by name / team / P-code. Each hit needs a human tap.
 */
export function IdentifyPanel({ photoId }: { photoId: number }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [searching, startSearch] = useTransition();
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [canScan, setCanScan] = useState(false);
  const [state, identify, pending] = useActionState<PhotoState, FormData>(identifyAction, null);

  useEffect(() => {
    // Feature detection has to run in the browser after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices);
  }, []);

  const search = (text: string, fromScan = false) => {
    if (text.trim().length < 2) return;
    setScanned(fromScan);
    startSearch(async () => {
      const res = await lookupAction(text);
      setHits(res.hits);
      setMsg(res.error ?? (res.hits.length ? null : "No one found. Try a name, team or the P-code on the badge."));
    });
  };

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        while (!stop && video.current) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            setQ(codes[0].rawValue);
            search(codes[0].rawValue, true);
            setScanning(false);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setMsg("Camera unavailable. Type the P-code from the badge instead.");
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  return (
    <div className="space-y-4">
      {canScan && (
        <div className="space-y-2">
          <button type="button" onClick={() => setScanning((s) => !s)} className={scanning ? secondaryBtn : primaryBtn}>
            {scanning ? "Stop camera" : "Scan badge QR"}
          </button>
          {scanning && <video ref={video} muted playsInline className="aspect-video w-full max-w-md bg-surface-2 object-cover" aria-label="Camera preview for badge scanning" />}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(q, /P-\d{3,}|khk_/i.test(q));
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <Label htmlFor="lookup-q" hint="P-code, name or team">
            Find a person
          </Label>
          <input id="lookup-q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className={`${inputCls} min-h-11`} />
        </div>
        <button type="submit" disabled={searching} className={secondaryBtn}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {msg && <p className="font-plex text-xs text-lightgray">{msg}</p>}
      {hits.length > 0 && (
        <ul className="border-t border-dashed border-hairline">
          {hits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-hairline py-2">
              <span className="min-w-0 font-plex text-sm">
                <span className="text-bright">{h.name}</span>
                <span className="block text-xs text-lightgray">
                  {h.public_code ?? "no code"} · {h.team_name ?? "no team"} · {h.checked_in ? "checked in" : "not checked in"} · photo consent{" "}
                  {h.publication === true ? "yes" : h.publication === false ? "NO" : "unknown"}
                </span>
              </span>
              <form action={identify}>
                <input type="hidden" name="photo_id" value={photoId} />
                <input type="hidden" name="member_id" value={h.id} />
                <input type="hidden" name="basis" value={scanned ? "qr_badge" : "manual_confirmation"} />
                <button type="submit" disabled={pending} className={secondaryBtn}>
                  This person is in the photo
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Result state={state} />
    </div>
  );
}
