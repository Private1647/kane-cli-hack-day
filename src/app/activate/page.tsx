import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import DegradedServiceAlert from "@/components/ui/DegradedServiceAlert";
import PageHeader from "@/components/ui/PageHeader";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent } from "@/lib/event";
import { isEnabled } from "@/lib/flags";
import { beginActivation, checkAdmission, getActivationState, type ActivationState } from "@/server/activation";
import { getMember, type MemberRow } from "@/server/auth";
import { githubEnabled } from "@/server/pairing";
import { CONSENT_CATEGORIES, CONSENT_COPY, getConsents, getPassport } from "@/server/passport";
import { AdmissionForm, CameraStep, CodeForm, ConsentForm, IdentityForm, StepFrame } from "./steps";

export const metadata: Metadata = { title: "Activate your passport", robots: { index: false } };

// /activate: one step at a time, always from the server's stored state, so a
// refresh, a crashed browser or a Kane run that stopped half way resumes at
// the right place. The wrapper carries data-checkpoint / data-activation-status
// for the Kane two-run controller (docs/hack-os/ACTIVATION_CONTRACT.md).

const STEPS = [
  { id: "code", label: "Sign in" },
  { id: "admission", label: "Registration" },
  { id: "identity", label: "Identity" },
  { id: "consent", label: "Privacy" },
  { id: "camera", label: "Selfie" },
  { id: "receipt", label: "Receipt" },
] as const;

export default function ActivatePage({ searchParams }: PageProps<"/activate">) {
  return (
    <main>
      <PageHeader
        eyebrow="Activate"
        dim="Hacker Passport,"
        bright="Activation."
        intro="Confirm your registration, choose what you share, and take an optional selfie. Your coding agent and Kane can do the typing; only you can press the shutter."
      />
      <section className="py-12 sm:py-16">
        <div className="container-page">
          <Suspense fallback={<p className="font-plex text-sm text-lightgray">Loading your activation…</p>}>
            <Flow searchParams={searchParams} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Flow({ searchParams }: Pick<PageProps<"/activate">, "searchParams">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.slice(0, 20) : "";
  if (!(await isEnabled("activation"))) {
    return (
      <DegradedServiceAlert state="degraded" system="Activation" manualRoute="/passport" manualLabel="Open your passport">
        Online activation is switched off right now. Check-in at the desk still works, and your passport is available.
      </DegradedServiceAlert>
    );
  }
  const member = await getMember();
  if (!member) return <SignedOut code={code} />;
  // Opening /activate is "resume": it creates the session if there is none.
  await beginActivation(member);
  const state = await getActivationState(member.id);
  return <Signed member={member} state={state} />;
}

function Shell({ current, state, children }: { current: (typeof STEPS)[number]["id"]; state: ActivationState | null; children: ReactNode }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div
      data-checkpoint={state?.marker ?? "awaiting_participant"}
      data-activation-status={state?.session?.status ?? "signed_out"}
      data-activation-step={current}
      className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]"
    >
      <nav aria-label="Activation steps">
        <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-0 lg:border-l lg:border-hairline">
          {STEPS.map((s, i) => {
            const here = i === idx;
            const done = i < idx;
            return (
              <li
                key={s.id}
                aria-current={here ? "step" : undefined}
                className={`flex min-h-11 items-center gap-3 border px-3 font-plex text-sm lg:-ml-px lg:border-0 lg:border-l-2 lg:px-4 ${
                  here ? "border-lime text-lime" : done ? "border-hairline text-bright" : "border-hairline text-lightgray"
                }`}
              >
                <span className="font-dots text-base">{String(i + 1).padStart(2, "0")}</span>
                <span>{s.label}</span>
                <span className="sr-only">{here ? "(current step)" : done ? "(done)" : "(to do)"}</span>
                {done && (
                  <span aria-hidden="true" className="text-lightgray">
                    ·done
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SignedOut({ code }: { code: string }) {
  return (
    <Shell current="code" state={null}>
      <StepFrame
        n={1}
        title="Enter your activation code"
        intro={
          <>
            Got a code from the check-in desk, or a link from <span className="text-bright">kanehack</span>? Enter it here. Registered with your team? You don’t need a code.
          </>
        }
      >
        <CodeForm initialCode={code} />
        <div className="mt-8 grid gap-3 border-t border-dashed border-hairline pt-6 font-plex text-sm sm:grid-cols-2">
          <Link href="/passport/login?next=/activate" className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
            Registered with a team? Sign in personally →
          </Link>
          <p className="text-lightgray">Not registered at all? Go to the check-in desk; walk-ins are welcome.</p>
        </div>
      </StepFrame>
    </Shell>
  );
}

async function Signed({ member, state }: { member: MemberRow; state: ActivationState }) {
  switch (state.step) {
    case "code":
    case "admission":
      return <AdmissionStep member={member} state={state} />;
    case "blocked":
      return <BlockedStep state={state} />;
    case "identity":
      return <IdentityStep member={member} state={state} />;
    case "consent":
      return <ConsentStep member={member} state={state} />;
    case "camera":
      return <CameraCheckpoint member={member} state={state} />;
    case "receipt":
      return <ReceiptStep state={state} />;
  }
}

async function AdmissionStep({ member, state }: { member: MemberRow; state: ActivationState }) {
  const check = await checkAdmission(member);
  return (
    <Shell current="admission" state={state}>
      <StepFrame n={2} title="Is this your registration?" intro="We match you against the approved guest list. We only ever show a masked email.">
        {check.status === "matched" && (
          <div className="space-y-6">
            <dl className="grid gap-4 border border-dashed border-hairline p-4 font-plex text-sm sm:grid-cols-3">
              <div>
                <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Name</dt>
                <dd className="mt-1 text-bright">{check.guest?.name ?? member.name}</dd>
              </div>
              <div>
                <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Email</dt>
                <dd className="mt-1 text-bright">{check.guest?.email_hint ?? "Admitted at the desk"}</dd>
              </div>
              <div>
                <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Source</dt>
                <dd className="mt-1 text-bright">{check.guest?.source === "walk_in" ? "Walk-in" : check.guest ? "Luma" : "Check-in desk"}</dd>
              </div>
            </dl>
            <AdmissionForm yesLabel="Yes, that’s me →" noLabel="That’s not me" />
          </div>
        )}
        {check.status === "no_roster" && (
          <div className="space-y-6">
            <p className="flex flex-wrap items-center gap-3 font-plex text-sm text-bright">
              <StatusPill tone="pending">Roster pending</StatusPill>
              The guest list hasn’t been loaded yet. Carry on; staff confirm your registration at check-in.
            </p>
            <AdmissionForm yesLabel="Continue →" />
          </div>
        )}
        {check.status === "not_approved" && <NotApproved reason={check.reason} />}
      </StepFrame>
    </Shell>
  );
}

function NotApproved({ reason }: { reason: string }) {
  return (
    <div className="space-y-6">
      <DegradedServiceAlert state="degraded" system="Registration" manualRoute="/help" manualLabel="Find the help desk">
        {reason === "needs_reconciliation"
          ? "Your registration needs a quick check by staff. Head to the check-in desk."
          : "We couldn’t find an approved registration for you. Go to the check-in desk: staff can admit you as a walk-in, then come back here."}
      </DegradedServiceAlert>
      <AdmissionForm yesLabel="I’ve been admitted at the desk, check again" />
    </div>
  );
}

function BlockedStep({ state }: { state: ActivationState }) {
  return (
    <Shell current="admission" state={state}>
      <StepFrame n={2} title="Let’s sort out your registration">
        <NotApproved reason="not_approved" />
      </StepFrame>
    </Shell>
  );
}

async function IdentityStep({ member, state }: { member: MemberRow; state: ActivationState }) {
  const p = await getPassport(member.id);
  return (
    <Shell current="identity" state={state}>
      <StepFrame n={3} title="Confirm who you are" intro="Only what helps on the day. Teams come later, and nothing here creates or joins one.">
        <IdentityForm
          defaults={{
            display_name: p.member.display_name ?? p.member.name,
            github_handle: p.member.github_handle ?? "",
            x_handle: "",
            skills: p.member.skills.join(", "),
            interests: p.member.interests.join(", "),
          }}
          githubHref={githubEnabled() ? "/api/v1/auth/github/start?next=/activate" : null}
          githubVerified={p.member.github_verified}
        />
      </StepFrame>
    </Shell>
  );
}

async function ConsentStep({ member, state }: { member: MemberRow; state: ActivationState }) {
  const current = await getConsents(member.id);
  return (
    <Shell current="consent" state={state}>
      <StepFrame n={4} title="Your privacy, one switch each" intro="Each choice is separate. Saying no to any of them never blocks check-in, help or submission.">
        <ConsentForm items={CONSENT_CATEGORIES.map((c) => ({ name: c, ...CONSENT_COPY[c], on: current[c] === true }))} />
      </StepFrame>
    </Shell>
  );
}

async function CameraCheckpoint({ member, state }: { member: MemberRow; state: ActivationState }) {
  const c = await getConsents(member.id);
  return (
    <Shell current="camera" state={state}>
      <StepFrame
        n={5}
        title="Human camera checkpoint"
        intro="If an agent brought you here, it has stopped. Press the shutter yourself, or skip. Your photo is stored privately and never sent to an AI."
      >
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusPill tone="pending">Waiting on you</StatusPill>
          {state.session?.status === "recoverable_error" && <StatusPill tone="danger">Last upload failed</StatusPill>}
        </div>
        <CameraStep canStore={c.selfie_storage === true} />
      </StepFrame>
    </Shell>
  );
}

async function ReceiptStep({ state }: { state: ActivationState }) {
  const ev = await getEvent();
  const r = state.receipt;
  return (
    <Shell current="receipt" state={state}>
      <StepFrame n={6} title="You’re activated" intro="Keep this receipt. It’s also on the back of your passport.">
        {r ? (
          <div className="space-y-6">
            <div className="border border-hairline bg-card p-5 text-ink">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-ink/60">Activation receipt</p>
              <p className="mt-2 font-dots text-4xl font-black" data-testid="activation-receipt">
                {r.code}
              </p>
              <p className="mt-2 font-plex text-xs text-ink/70">
                Server time {formatEventTime(r.server_time, ev)} · {r.server_time.toISOString()}
              </p>
            </div>
            <ul className="space-y-2 font-plex text-sm">
              {r.checks.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3">
                  {c.ok ? <span className="text-bright">✓ Done</span> : <StatusPill tone="unverified">Not run</StatusPill>}
                  <span className="text-bright">{c.label}</span>
                  {c.detail && <span className="text-xs text-lightgray">{c.detail}</span>}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/passport" className="inline-flex min-h-11 items-center bg-bright px-5 font-plex text-sm text-ink transition-colors hover:bg-lime">
                Open my passport →
              </Link>
              <Link href="/readiness" className="inline-flex min-h-11 items-center border border-hairline px-5 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime">
                Check Kane readiness
              </Link>
            </div>
          </div>
        ) : (
          <p className="font-plex text-sm text-lightgray">Finishing up… reload in a moment.</p>
        )}
      </StepFrame>
    </Shell>
  );
}
