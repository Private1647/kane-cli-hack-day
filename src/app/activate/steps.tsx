"use client";

import QRCode from "qrcode";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FormError, Label, SubmitButton, Toggle, inputCls } from "@/components/forms/fields";
import { admission, consents, identity, openCamera, phoneHandoff, redeemCode, skipPhoto, type StepState } from "./actions";
import HumanCameraCheckpoint from "./HumanCameraCheckpoint";

// The client half of each /activate step. The server page decides which step
// to show from the stored state; these only collect input and post it.

export function StepFrame({ n, title, children, intro }: { n: number; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="brackets border border-hairline bg-surface p-5 sm:p-8">
      <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Step {String(n).padStart(2, "0")}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-bright sm:text-3xl">{title}</h2>
      {intro && <div className="mt-3 max-w-xl font-plex text-sm leading-relaxed text-lightgray">{intro}</div>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

// ── 1. Code ──────────────────────────────────────────────────────────────────

export function CodeForm({ initialCode }: { initialCode: string }) {
  const [state, action] = useActionState<StepState, FormData>(redeemCode, null);
  const [code, setCode] = useState(state?.code ?? initialCode);
  return (
    <form action={action} className="space-y-6" data-testid="activation-code-form">
      <div>
        <Label htmlFor="code" hint="From the check-in desk or kanehack">
          Activation code
        </Label>
        <input
          id="code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="one-time-code"
          placeholder="XXXX-XXXX"
          className={`${inputCls} uppercase tracking-[0.2em]`}
        />
      </div>
      {state?.needsEmail && (
        <div>
          <Label htmlFor="email" hint="The one Luma has">
            Your registration email
          </Label>
          <input id="email" name="email" type="email" required autoFocus autoComplete="email" defaultValue={state.email} className={inputCls} />
          <p className="mt-2 font-plex text-xs text-lightgray">We only compare it with your registration. It isn’t shown to anyone.</p>
        </div>
      )}
      <FormError message={state?.error} />
      <SubmitButton pending="Checking…" className="min-h-11">
        Continue →
      </SubmitButton>
    </form>
  );
}

// ── 2. Admission ─────────────────────────────────────────────────────────────

export function AdmissionForm({ yesLabel, noLabel }: { yesLabel: string; noLabel?: string }) {
  const [state, action] = useActionState<StepState, FormData>(admission, null);
  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      <div className="flex flex-wrap gap-3">
        <button name="answer" value="yes" className="min-h-11 bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime">
          {yesLabel}
        </button>
        {noLabel && (
          <button name="answer" value="no" className="min-h-11 border border-hairline px-5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime">
            {noLabel}
          </button>
        )}
      </div>
    </form>
  );
}

// ── 3. Identity ──────────────────────────────────────────────────────────────

export function IdentityForm({
  defaults,
  githubHref,
  githubVerified,
}: {
  defaults: { display_name: string; github_handle: string; x_handle: string; skills: string; interests: string };
  githubHref: string | null;
  githubVerified: boolean;
}) {
  const [state, action] = useActionState<StepState, FormData>(identity, null);
  return (
    <form action={action} className="space-y-6">
      <div>
        <Label htmlFor="display_name" hint="Shown as first name + last initial">
          What should we call you?
        </Label>
        <input id="display_name" name="display_name" required maxLength={60} defaultValue={defaults.display_name} autoComplete="name" className={inputCls} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="github_handle" hint={githubVerified ? "Verified" : "Optional"}>
            GitHub username
          </Label>
          <input id="github_handle" name="github_handle" maxLength={39} defaultValue={defaults.github_handle} autoComplete="username" placeholder="octocat" className={inputCls} />
          {githubHref && !githubVerified && (
            <a href={githubHref} className="mt-2 inline-flex min-h-11 items-center font-plex text-xs text-bright underline underline-offset-4 hover:text-lime">
              Verify with GitHub instead →
            </a>
          )}
        </div>
        <div>
          <Label htmlFor="x_handle" hint="Optional">
            X handle
          </Label>
          <input id="x_handle" name="x_handle" maxLength={60} defaultValue={defaults.x_handle} placeholder="@handle" className={inputCls} />
        </div>
      </div>
      <div>
        <Label htmlFor="skills" hint="Comma separated">
          Skills
        </Label>
        <input id="skills" name="skills" defaultValue={defaults.skills} placeholder="react, playwright, python" className={inputCls} />
      </div>
      <div>
        <Label htmlFor="interests" hint="Comma separated">
          Interested in
        </Label>
        <input id="interests" name="interests" defaultValue={defaults.interests} placeholder="agents, ci, mobile testing" className={inputCls} />
      </div>
      <FormError message={state?.error} />
      <SubmitButton pending="Saving…" className="min-h-11">
        Confirm identity →
      </SubmitButton>
    </form>
  );
}

// ── 4. Consent ───────────────────────────────────────────────────────────────

export function ConsentForm({ items }: { items: { name: string; label: string; description: string; on: boolean }[] }) {
  const [state, action] = useActionState<StepState, FormData>(consents, null);
  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="sr-only">Privacy choices, one per category</legend>
        <ul className="divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
          {items.map((i) => (
            <li key={i.name} className="py-2">
              <Toggle name={i.name} label={i.label} description={i.description} defaultChecked={i.on} />
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="font-plex text-xs text-lightgray">Everything starts off. You can change any of these later from your passport; we keep a record of each change.</p>
      <FormError message={state?.error} />
      <SubmitButton pending="Saving…" className="min-h-11">
        Save my choices →
      </SubmitButton>
    </form>
  );
}

// ── 5. Camera ────────────────────────────────────────────────────────────────

export function CameraStep({ canStore }: { canStore: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState<{ url: string; svg: string; minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // While a phone link is out, watch for the server to see the photo.
  useEffect(() => {
    if (!phone) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/v1/activate/checkpoints", { cache: "no-store" }).catch(() => null);
      const env = (await res?.json().catch(() => null)) as { data?: { status?: string } } | null;
      const s = env?.data?.status;
      if (s && ["selfie_confirmed", "selfie_skipped", "active", "browser_verified"].includes(s)) {
        clearInterval(id);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [phone, router]);

  function makePhoneLink() {
    setError(null);
    start(async () => {
      const r = await phoneHandoff();
      if (!r.url) return setError(r.error ?? "Couldn’t make a phone link.");
      const svg = await QRCode.toString(r.url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#f2f2f2" } });
      setPhone({ url: r.url, svg, minutes: r.minutes ?? 15 });
    });
  }

  const alternatives = (
    <div className="space-y-4">
      {phone ? (
        <div className="flex flex-wrap items-start gap-5">
          <div role="img" aria-label="QR code: open the camera step on your phone" className="h-40 w-40 bg-card [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: phone.svg }} />
          <div className="min-w-0 flex-1 space-y-2 font-plex text-sm">
            <p className="text-bright">Scan with your phone and take the photo there.</p>
            <p className="text-lightgray">The link works once and expires in {phone.minutes} minutes. This page moves on by itself when the photo arrives.</p>
            <p className="break-all text-xs text-lightgray">{phone.url}</p>
            <p role="status" className="font-pixel text-[10px] uppercase tracking-[0.2em] text-warning">
              ◷ Waiting for your phone…
            </p>
          </div>
        </div>
      ) : (
        canStore && (
          <button
            type="button"
            onClick={makePhoneLink}
            disabled={pending}
            className="min-h-11 border border-hairline px-5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-60"
          >
            {pending ? "Making link…" : "Use my phone instead"}
          </button>
        )
      )}
      {error && (
        <p role="alert" className="font-plex text-sm text-danger">
          {error}
        </p>
      )}
      <SkipForm reason={canStore ? "declined" : "no_consent"} />
    </div>
  );

  if (!canStore) {
    return (
      <div className="space-y-4">
        <p className="font-plex text-sm text-bright">You chose not to store a selfie, so there’s no camera step. Your passport uses a monogram and your badge QR.</p>
        <SkipForm reason="no_consent" label="Continue without a photo →" primary />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <HumanCameraCheckpoint onOpen={() => openCamera()} onDone={() => router.refresh()} fallback={alternatives} />
      <details className="border-t border-dashed border-hairline pt-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-plex text-sm text-lightgray hover:text-bright">Other options: phone camera or skip →</summary>
        <div className="mt-4">{alternatives}</div>
      </details>
    </div>
  );
}

function SkipForm({ reason, label = "Skip the photo", primary = false }: { reason: string; label?: string; primary?: boolean }) {
  const [state, action] = useActionState<StepState, FormData>(skipPhoto, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reason" value={reason} />
      <FormError message={state?.error} />
      {primary ? (
        <SubmitButton pending="Finishing…" className="min-h-11">
          {label}
        </SubmitButton>
      ) : (
        <button type="submit" className="min-h-11 px-1 font-plex text-sm text-lightgray underline underline-offset-4 hover:text-bright">
          {label}. It never blocks anything.
        </button>
      )}
    </form>
  );
}
