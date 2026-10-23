"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Take a photo with the laptop or phone camera, or pick a file. The image is
// checked for size, focus and light, scaled down, and uploaded straight to the
// private Blob store; the parent only keeps the returned pathname.

export type PhotoValue = { pathname: string; preview: string } | null;

type Kind = "group" | "selfie";
type Check = { blob: Blob; preview: string; width: number; height: number; issues: string[] };

const MAX_SIDE = 2000;
const MIN_SHORT_SIDE = 600;

export default function PhotoInput({
  kind,
  value,
  onChange,
  label,
  variant = "frame",
  hint,
}: {
  kind: Kind;
  value: PhotoValue;
  onChange: (v: PhotoValue) => void;
  label: string;
  /** "avatar": a round tap target for selfies. "frame": a large drop zone. */
  variant?: "avatar" | "frame";
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (e instanceof MouseEvent ? !box.current?.contains(e.target as Node) : e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  async function accept(c: Check) {
    setCheck(null);
    setStatus("uploading");
    setError("");
    try {
      const res = await upload(`reg/${kind}.jpg`, c.blob, { access: "private", handleUploadUrl: "/api/upload", contentType: "image/jpeg" });
      onChange({ pathname: res.pathname, preview: c.preview });
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message || "Upload failed. Try again.");
    }
  }

  async function take(source: Blob) {
    setStatus("checking");
    setError("");
    try {
      const c = await inspect(source, kind);
      if (c.issues.length) {
        setCheck(c);
        setStatus("idle");
      } else await accept(c);
    } catch {
      setStatus("error");
      setError("Couldn't read that image. Try a JPEG or PNG.");
    }
  }

  const busy = status === "checking" || status === "uploading";
  const busyLabel = status === "checking" ? "Checking…" : "Uploading…";
  const openCamera = () => {
    setMenu(false);
    setCamera(true);
  };
  const openFiles = () => {
    setMenu(false);
    fileRef.current?.click();
  };
  const remove = () => {
    setMenu(false);
    onChange(null);
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) take(f);
      }}
    />
  );

  return (
    <div className="space-y-3">
      {variant === "avatar" ? (
        <div ref={box} className="relative flex items-center gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={value ? `Change ${label}` : `Add ${label}`}
            className={`group relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border transition-colors ${
              value ? "border-lime" : "border-dashed border-lightgray hover:border-lime"
            }`}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob/object URLs, not optimisable
              <img src={value.preview} alt={label} className="h-full w-full object-cover" />
            ) : (
              <CameraIcon className="h-6 w-6 text-lightgray transition-colors group-hover:text-lime" />
            )}
            {busy && <span className="absolute inset-0 grid place-items-center bg-ink/75 font-plex text-[10px] text-bright">{busyLabel}</span>}
          </button>
          <div className="min-w-0 font-plex">
            <button type="button" disabled={busy} onClick={() => setMenu((m) => !m)} className="text-sm text-bright hover:text-lime">
              {value ? "Change photo" : "Add a selfie"}
            </button>
            {hint && <p className="mt-0.5 text-xs text-lightgray">{hint}</p>}
          </div>
          {menu && (
            <div role="menu" className="absolute left-0 top-[5.5rem] z-20 w-48 border border-hairline bg-ink py-1 shadow-2xl">
              <MenuItem onClick={openCamera}>Take a selfie</MenuItem>
              <MenuItem onClick={openFiles}>Upload a photo</MenuItem>
              {value && <MenuItem onClick={remove} danger>Remove</MenuItem>}
            </div>
          )}
          {fileInput}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !busy) take(f);
          }}
          className={`relative overflow-hidden border transition-colors ${kind === "selfie" ? "aspect-square max-w-xs" : "aspect-[16/10] max-h-[22rem] w-full sm:aspect-[2/1]"} ${
            drag ? "border-lime bg-lime-deep" : value ? "border-hairline" : "border-dashed border-lightgray/60 bg-surface"
          }`}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob/object URLs, not optimisable */}
              <img src={value.preview} alt={label} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-ink/90 to-transparent p-3 pt-10">
                <OverlayButton onClick={openCamera} disabled={busy}>Retake</OverlayButton>
                <OverlayButton onClick={openFiles} disabled={busy}>Replace</OverlayButton>
                <OverlayButton onClick={remove} disabled={busy}>Remove</OverlayButton>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <CameraIcon className="h-8 w-8 text-lightgray" />
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openCamera}
                  className="bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:opacity-50"
                >
                  Take a photo
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openFiles}
                  className="border border-hairline px-4 py-2.5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
                >
                  Upload
                </button>
              </div>
              <p className="font-plex text-xs text-lightgray">{hint ?? "or drop an image here"}</p>
            </div>
          )}
          {busy && <div className="absolute inset-0 grid place-items-center bg-ink/75 font-plex text-sm text-bright">{busyLabel}</div>}
          {fileInput}
        </div>
      )}

      {check && (
        <div className="border-l-2 border-amber-400 pl-3 font-plex text-xs text-bright">
          <p className="text-amber-300">This photo may not work well for matching:</p>
          <ul className="mt-1 list-disc pl-4 text-lightgray">
            {check.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={() => { setCheck(null); setCamera(true); }} className="text-bright underline underline-offset-4 hover:text-lime">
              Retake
            </button>
            <button type="button" onClick={() => accept(check)} className="text-lightgray underline underline-offset-4 hover:text-bright">
              Use it anyway
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="font-plex text-xs text-red-300">
          {error}
        </p>
      )}

      {camera && (
        <CameraDialog
          kind={kind}
          onClose={() => setCamera(false)}
          onCapture={(b) => {
            setCamera(false);
            take(b);
          }}
        />
      )}
    </div>
  );
}

function MenuItem({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-4 py-2.5 text-left font-plex text-sm transition-colors hover:bg-surface ${danger ? "text-red-300" : "text-bright hover:text-lime"}`}
    >
      {children}
    </button>
  );
}

function OverlayButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border border-bright/30 bg-ink/60 px-3 py-1.5 font-plex text-xs text-bright backdrop-blur transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// ── Camera ──────────────────────────────────────────────────────────────────

function CameraDialog({ kind, onClose, onCapture }: { kind: Kind; onClose: () => void; onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">(kind === "selfie" ? "user" : "environment");
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let live = true;
    if (!navigator.mediaDevices) {
      queueMicrotask(() => setError("This browser can't open the camera. Use Upload instead."));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("Camera not available. Allow camera access in your browser, or use Upload instead."));
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    // The preview is mirrored for the front camera; save the real (unmirrored) image.
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.92);
  }

  // A short countdown so a group can get in frame, or a hand can leave the trackpad.
  function shoot() {
    let n = 3;
    setCount(n);
    const id = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(id);
        setCount(null);
        snap();
      } else setCount(n);
    }, 1000);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Take a photo" className="fixed inset-0 z-50 grid place-items-center bg-ink/90 p-4">
      <div className="w-full max-w-2xl space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden border border-hairline bg-black">
          {error ? (
            <p className="grid h-full place-items-center p-6 text-center font-plex text-sm text-lightgray">{error}</p>
          ) : (
            <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
          )}
          {/* Framing guide */}
          {!error && (
            <div
              aria-hidden
              className={`pointer-events-none absolute border-2 border-dashed border-lime/60 ${
                kind === "selfie" ? "left-1/2 top-1/2 h-3/4 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%]" : "inset-[8%]"
              }`}
            />
          )}
          {count !== null && <div className="absolute inset-0 grid place-items-center font-dots text-8xl font-black text-lime">{count}</div>}
        </div>
        <p className="font-plex text-xs text-lightgray">
          {kind === "selfie"
            ? "Face the camera, good light on your face, no sunglasses or hats."
            : "Everyone in frame, faces visible and looking at the camera, light in front of you not behind."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!error || count !== null}
            onClick={shoot}
            className="bg-bright px-4 py-2.5 font-plex text-sm text-ink transition-colors hover:bg-lime disabled:opacity-50"
          >
            Take photo (3s)
          </button>
          <button
            type="button"
            disabled={!!error || count !== null}
            onClick={snap}
            className="border border-hairline px-4 py-2.5 font-plex text-sm text-bright hover:border-lime disabled:opacity-50"
          >
            Now
          </button>
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            className="border border-hairline px-4 py-2.5 font-plex text-sm text-bright hover:border-lime"
          >
            Flip camera
          </button>
          <button type="button" onClick={onClose} className="ml-auto px-3 py-2.5 font-plex text-sm text-lightgray hover:text-bright">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quality check and resize ────────────────────────────────────────────────

async function inspect(source: Blob, kind: Kind): Promise<Check> {
  const bmp = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);

  const issues: string[] = [];
  if (Math.min(bmp.width, bmp.height) < MIN_SHORT_SIDE) issues.push(`It's small (${bmp.width}×${bmp.height}). Use a photo at least ${MIN_SHORT_SIDE}px on its shorter side.`);

  // Sharpness: variance of a Laplacian over a 320px-wide greyscale copy. Brightness: mean grey.
  const sw = 320;
  const sh = Math.max(1, Math.round((height / width) * sw));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const px = sctx.getImageData(0, 0, sw, sh).data;
  const grey = new Float32Array(sw * sh);
  let sum = 0;
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    sum += grey[i];
  }
  const mean = sum / grey.length;
  let lsum = 0;
  let lsq = 0;
  let n = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      const l = grey[i - 1] + grey[i + 1] + grey[i - sw] + grey[i + sw] - 4 * grey[i];
      lsum += l;
      lsq += l * l;
      n++;
    }
  }
  const sharpness = lsq / n - (lsum / n) ** 2;
  if (sharpness < 60) issues.push("It looks blurry. Hold still, or tap to focus before taking it.");
  if (mean < 55) issues.push("It's quite dark. Face a window or a light.");
  if (mean > 215) issues.push("It's very bright or washed out. Step out of direct light.");
  if (kind === "group" && width < height * 0.9) issues.push("Group photos work best in landscape, with everyone in one row.");

  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.9));
  return { blob, preview: URL.createObjectURL(blob), width, height, issues };
}
