"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

// The human camera checkpoint (T-ACT-03). Kane drives the browser up to this
// point and then stops: there is deliberately no programmatic capture path.
// The shutter and "Use this photo" only act on a trusted (real user) click,
// the file goes straight to our private store, never through an agent, and
// denying the camera falls through to the phone link or skipping.

type Phase = "idle" | "requesting" | "live" | "preview" | "uploading" | "done" | "denied" | "unsupported" | "error";

const MAX_SIDE = 1024;

export default function HumanCameraCheckpoint({
  uploadUrl = "/api/v1/activate/selfie",
  fields = {},
  onOpen,
  onDone,
  fallback,
}: {
  uploadUrl?: string;
  /** Extra multipart fields (the phone handoff token). */
  fields?: Record<string, string>;
  /** Called once the person opens the camera (moves the server to selfie_pending). */
  onOpen?: () => Promise<unknown> | void;
  onDone?: (result: { status?: string; receipt_code?: string | null }) => void;
  /** What to offer when the camera is denied or missing (phone link, skip). */
  fallback?: ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shot, setShot] = useState<{ blob: Blob; url: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

  async function start(e: MouseEvent) {
    if (!e.nativeEvent.isTrusted) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    setPhase("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      setPhase("live");
      await onOpen?.();
    } catch (err) {
      const name = (err as DOMException)?.name;
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unsupported" : "error");
      if (name !== "NotAllowedError" && name !== "NotFoundError") setError("The camera didn’t start. Check no other app is using it.");
    }
  }

  // Attach the stream once the <video> is on screen.
  useEffect(() => {
    if (phase === "live" && video.current && stream.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {});
    }
  }, [phase]);

  function shutter(e: MouseEvent) {
    // Only a real click counts. A script calling .click() has isTrusted=false.
    if (!e.nativeEvent.isTrusted) {
      setError("The shutter only works when you press it yourself.");
      return;
    }
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    // Mirror to match what the person saw in the preview.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (!blob) return setError("Couldn’t take the photo. Try again.");
        setShot({ blob, url: URL.createObjectURL(blob), key: crypto.randomUUID() });
        setPhase("preview");
      },
      "image/jpeg",
      0.85,
    );
  }

  async function confirm(e: MouseEvent) {
    if (!e.nativeEvent.isTrusted || !shot) return;
    setPhase("uploading");
    setError(null);
    const body = new FormData();
    body.set("file", new File([shot.blob], "selfie.jpg", { type: "image/jpeg" }));
    body.set("trusted", "1");
    body.set("idempotency_key", shot.key);
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    try {
      const res = await fetch(uploadUrl, { method: "POST", body });
      const env = (await res.json().catch(() => null)) as { status?: string; message?: string; error?: { next_action?: string } | null; data?: { status?: string; receipt_code?: string | null } } | null;
      if (!res.ok || !env || env.status === "error") throw new Error([env?.message, env?.error?.next_action].filter(Boolean).join(" ") || "Upload failed. Try again.");
      stop();
      setPhase("done");
      onDone?.(env.data ?? {});
    } catch (err) {
      setPhase("preview");
      setError((err as Error).message);
    }
  }

  const status: Record<Phase, string> = {
    idle: "Camera off. Nothing is recorded until you press the shutter.",
    requesting: "Asking your browser for the camera…",
    live: "Camera on. Press the shutter when you’re ready.",
    preview: "Check the photo. Use it or retake.",
    uploading: "Saving your photo privately…",
    done: "Photo saved.",
    denied: "Camera blocked in this browser.",
    unsupported: "No camera found in this browser.",
    error: "The camera didn’t start.",
  };

  return (
    <div className="space-y-4">
      <div className="brackets relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden border border-hairline bg-surface-2">
        {phase === "live" && <video ref={video} muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Live camera preview" />}
        {(phase === "preview" || phase === "uploading") && shot && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, never optimised
          <img src={shot.url} alt="Your photo, ready to confirm" className="h-full w-full object-cover" />
        )}
        {!["live", "preview", "uploading"].includes(phase) && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span aria-hidden="true" className="font-dots text-5xl text-lightgray">
              {phase === "done" ? "✓" : "◎"}
            </span>
            <p className="font-plex text-xs text-lightgray">{phase === "done" ? "Saved privately." : "Preview appears here"}</p>
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className="text-center font-plex text-sm text-lightgray">
        {status[phase]}
      </p>
      {error && (
        <p role="alert" className="border-l-2 border-danger pl-3 font-plex text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {(phase === "idle" || phase === "error") && (
          <button type="button" onClick={start} className="min-h-11 bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime">
            Open camera
          </button>
        )}
        {phase === "live" && (
          <button
            type="button"
            onClick={shutter}
            aria-label="Take photo (shutter)"
            className="inline-flex min-h-14 min-w-14 items-center justify-center gap-2 border-2 border-lime bg-lime-deep px-6 font-plex text-sm text-lime transition-colors hover:bg-lime hover:text-ink"
          >
            <span aria-hidden="true">●</span> Shutter
          </button>
        )}
        {(phase === "preview" || phase === "uploading") && (
          <>
            <button
              type="button"
              onClick={confirm}
              disabled={phase === "uploading"}
              className="min-h-11 bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:cursor-wait disabled:opacity-60"
            >
              {phase === "uploading" ? "Saving…" : "Use this photo"}
            </button>
            <button
              type="button"
              disabled={phase === "uploading"}
              onClick={(e) => {
                if (!e.nativeEvent.isTrusted) return;
                setShot(null);
                setError(null);
                setPhase(stream.current ? "live" : "idle");
              }}
              className="min-h-11 border border-hairline px-5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
            >
              Retake
            </button>
          </>
        )}
      </div>

      {(phase === "denied" || phase === "unsupported") && fallback && (
        <div className="border-t border-dashed border-hairline pt-4">
          <p className="mb-3 font-plex text-sm text-bright">
            {phase === "denied" ? "No problem. Use your phone instead, or skip the photo." : "Use your phone’s camera instead, or skip the photo."}
          </p>
          {fallback}
        </div>
      )}
    </div>
  );
}
