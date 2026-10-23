import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import Flip from "@/components/ui/Flip";
import QR from "@/components/ui/QR";
import { Eyebrow } from "@/components/ui/Section";
import StatusPill from "@/components/ui/StatusPill";
import { formatEventTime, getEvent } from "@/lib/event";
import { getMember, memberActor } from "@/server/auth";
import { siteUrl } from "@/server/core";
import { githubEnabled, listBearerTokens } from "@/server/pairing";
import { CONSENT_CATEGORIES, CONSENT_COPY, getBadgeToken, getPassport, toPublicPassport, type PrivatePassport } from "@/server/passport";
import { revokeToken, signOut } from "./actions";
import { LoginCodeButton, PasswordForm, ProfileForm, RotateBadgeButton } from "./forms";
import PersonalLoginForm from "./login/LoginForm";
import NextMissionCard from "./NextMissionCard";
import { BackSection, Chips, PassportBack, PassportFront, type CardFace } from "./PassportCard";

export const metadata: Metadata = { title: "Passport", robots: { index: false } };

// The Hacker Passport (T-PASS-01..04): the card on a plinth on the left, the
// mission console on the right, then settings. Everything comes from the
// private DTO; the badge QR holds only a revocable signed token.

export default function PassportPage({ searchParams }: PageProps<"/passport">) {
  return (
    <main>
      <Suspense fallback={<Loading />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Loading() {
  return (
    <div className="container-page py-24">
      <p className="font-plex text-sm text-lightgray">Loading your passport…</p>
    </div>
  );
}

const GITHUB_FLASH: Record<string, { tone: "ok" | "warn"; text: string }> = {
  linked: { tone: "ok", text: "GitHub linked and verified." },
  failed: { tone: "warn", text: "GitHub didn’t confirm the link. Try again in a minute." },
  taken: { tone: "warn", text: "That GitHub account is already linked to another passport." },
  disabled: { tone: "warn", text: "GitHub linking isn’t switched on yet. Type your username instead." },
  cancelled: { tone: "warn", text: "GitHub linking was cancelled." },
};

async function Body({ searchParams }: Pick<PageProps<"/passport">, "searchParams">) {
  const member = await getMember();
  if (!member) return <SignedOut />;
  const sp = await searchParams;
  const [p, badge, tokens, ev] = await Promise.all([getPassport(member.id), getBadgeToken(member.id, memberActor(member)), listBearerTokens(member.id), getEvent()]);
  const pub = toPublicPassport(p);
  const flash = typeof sp.github === "string" ? GITHUB_FLASH[sp.github] : undefined;

  const face: CardFace = {
    short_name: p.member.short_name,
    role_tag: pub.role_tag,
    handle: p.member.github_handle ? `@${p.member.github_handle}` : p.member.x_handle ? `@${p.member.x_handle}` : null,
    edition: p.edition,
    // Private view: you always see your own portrait, whatever you publish.
    portrait_src: p.portrait?.src ?? null,
    activated: p.activation?.status === "active",
    kane_verified: !!p.activation?.kane_verified,
    team_label: p.team ? (p.team.is_solo ? "Solo builder" : `Team ${p.team.name}`) : "Looking for team",
    receipt_code: p.activation?.receipt_code ?? null,
    public_code: p.member.public_code,
  };

  return (
    <>
      <section className="border-b border-dashed border-hairline py-12 sm:py-16">
        <div className="container-page grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          {/* Left: the card on its plinth */}
          <div
            className="brackets border border-hairline p-5 sm:p-8"
            style={{ backgroundImage: "radial-gradient(var(--hairline) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
          >
            <div className="mx-auto max-w-[22rem]">
              <Flip
                label="Flip passport"
                front={<PassportFront face={face} qr={<QR value={siteUrl(`/passport/b/${badge.token}`)} size={76} label="QR code: your badge (revocable)" />} />}
                back={<Back p={p} />}
              />
            </div>
          </div>

          {/* Right: mission console */}
          <div className="min-w-0 space-y-8">
            <div>
              <Eyebrow>
                <Link href="/" className="hover:text-bright">
                  Hack Day
                </Link>{" "}
                / Passport
              </Eyebrow>
              <h1 className="mt-4 font-display text-4xl leading-[1.05] font-semibold text-bright sm:text-5xl">
                {p.member.short_name}
                <span className="font-dots text-lime">.</span>
              </h1>
              <p className="mt-3 font-plex text-sm text-lightgray">
                {p.member.public_code} · {face.team_label}
                {p.member.checked_in_at ? ` · checked in ${formatEventTime(p.member.checked_in_at, ev)}` : " · not checked in yet"}
              </p>
            </div>

            {flash && (
              <p role="status" className={`border-l-2 pl-3 font-plex text-sm ${flash.tone === "ok" ? "border-hairline text-bright" : "border-warning text-warning"}`}>
                {flash.text}
              </p>
            )}

            <StageTrack stage={p.stage} />
            <NextMissionCard mission={p.mission} />
            <Actions p={p} />
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-page grid gap-6 lg:grid-cols-2">
          <Panel title="Activation" id="activation">
            <ActivationPanel p={p} ev={ev} />
          </Panel>
          <Panel title="Kane readiness" id="readiness">
            {p.readiness ? (
              <p className="font-plex text-sm text-bright">
                Last report {formatEventTime(p.readiness.at, ev)}: {p.readiness.passed} passing, {p.readiness.failed} failing.{" "}
                <span className="text-lightgray">Reported by your machine, not verified by us.</span>
              </p>
            ) : (
              <p className="font-plex text-sm text-lightgray">No readiness report yet.</p>
            )}
            <Link href="/readiness" className="mt-4 inline-flex min-h-11 items-center font-plex text-sm text-bright underline underline-offset-4 hover:text-lime">
              Open the readiness doctor →
            </Link>
          </Panel>

          <Panel title="Profile and privacy" id="privacy" wide>
            <div className="mb-6 flex flex-wrap items-center gap-3 font-plex text-sm">
              {p.member.github_verified ? (
                <StatusPill tone="verified">Verified · GitHub @{p.member.github_handle}</StatusPill>
              ) : p.member.github_handle ? (
                <StatusPill tone="unverified">GitHub @{p.member.github_handle} · unverified</StatusPill>
              ) : null}
              {githubEnabled() && !p.member.github_verified && (
                <a href="/api/v1/auth/github/start" className="inline-flex min-h-11 items-center text-bright underline underline-offset-4 hover:text-lime">
                  Verify with GitHub →
                </a>
              )}
            </div>
            <ProfileForm
              defaults={{
                display_name: p.member.display_name ?? p.member.name,
                github_handle: p.member.github_handle ?? "",
                x_handle: p.member.x_handle ?? "",
                skills: p.member.skills.join(", "),
                interests: p.member.interests.join(", "),
              }}
              consents={CONSENT_CATEGORIES.map((c) => ({ name: c, ...CONSENT_COPY[c], on: p.consents[c] === true }))}
            />
          </Panel>

          <Panel title="Badge" id="badge">
            <p className="font-plex text-sm text-lightgray">
              Your badge QR holds a signed token, not your details. Staff use your <span className="text-bright">{p.member.public_code}</span> code if the QR won’t scan.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/passport/badge" className="inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink transition-colors hover:bg-lime">
                Print my badge
              </Link>
            </div>
            <div className="mt-4">
              <RotateBadgeButton />
            </div>
          </Panel>

          <Panel title="Sign-in and devices" id="devices">
            <div className="space-y-6">
              <p className="font-plex text-sm text-lightgray">
                Sign in on your own with your email and your team password{p.member.has_password ? " or your personal password" : ""}. Signed in as {p.member.email_hint}.
              </p>
              <PasswordForm />
              <LoginCodeButton />
              <div>
                <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Paired CLI / MCP clients</p>
                {tokens.length ? (
                  <ul className="mt-2 divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
                    {tokens.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2 font-plex text-sm">
                        <span className="text-bright">
                          {t.label ?? "kanehack"} <span className="text-xs text-lightgray">· last used {t.last_used_at ? formatEventTime(t.last_used_at, ev) : "never"}</span>
                        </span>
                        <form action={revokeToken}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="min-h-11 px-2 text-xs text-lightgray underline underline-offset-4 hover:text-danger">Revoke</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 font-plex text-sm text-lightgray">
                    None. Run <code className="text-bright">kanehack login</code> and approve the code at{" "}
                    <Link href="/pair" className="text-bright underline underline-offset-4 hover:text-lime">
                      /pair
                    </Link>
                    .
                  </p>
                )}
              </div>
              <form action={signOut}>
                <button className="min-h-11 border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime">Sign out</button>
              </form>
            </div>
          </Panel>
        </div>
      </section>
    </>
  );
}

function SignedOut() {
  return (
    <section className="py-16 sm:py-24">
      <div className="container-page grid gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>Hack Day / Passport</Eyebrow>
          <h1 className="mt-4 font-display text-4xl font-semibold text-bright sm:text-5xl">
            Your Hacker Passport<span className="font-dots text-lime">.</span>
          </h1>
          <p className="mt-4 max-w-md font-plex text-sm leading-relaxed text-lightgray">
            Your event identity and your next step: team, idea, Kane proof, help and submission in one place. Sign in with the email you registered with and your team password.
          </p>
          <ul className="mt-8 space-y-3 font-plex text-sm">
            <li>
              <Link href="/activate" className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Have an activation code from the desk? Activate →
              </Link>
            </li>
            <li>
              <Link href="/register" className="inline-flex min-h-11 items-center text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                Not registered yet? Register →
              </Link>
            </li>
          </ul>
        </div>
        <div className="brackets border border-hairline bg-surface p-5 sm:p-8">
          <h2 className="font-display text-2xl font-semibold text-bright">Sign in</h2>
          <div className="mt-6">
            <PersonalLoginForm next="/passport" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StageTrack({ stage }: { stage: PrivatePassport["stage"] }) {
  const stages = [
    { id: "solo", label: "Solo" },
    { id: "member", label: "On a team" },
    { id: "shipped", label: "Shipped" },
  ] as const;
  return (
    <div>
      <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Your stage</p>
      <ol className="inline-flex flex-wrap border border-hairline bg-surface-2" aria-label="Your stage">
        {stages.map((s) => {
          const on = s.id === stage;
          return (
            <li
              key={s.id}
              aria-current={on ? "step" : undefined}
              className={`flex min-h-11 items-center px-4 font-plex text-sm ${on ? "bg-lime-deep text-lime outline outline-1 -outline-offset-1 outline-lime" : "text-lightgray"}`}
            >
              {s.label}
              {on && <span className="sr-only"> (current)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Actions({ p }: { p: PrivatePassport }) {
  const slug = p.team?.slug;
  const items = [
    !p.team && { id: "join_team", label: "Join team", href: "/team/join" },
    !p.team && { id: "create_team", label: "Create team", href: "/team/new" },
    (!p.team || p.team.size < 5) && { id: "find_teammates", label: "Find teammates", href: "/match" },
    { id: "readiness", label: "Check Kane readiness", href: "/readiness" },
    slug && { id: "validate_idea", label: "Validate idea", href: `/t/${slug}/idea` },
    { id: "ask_mentor", label: "Ask mentor", href: slug ? `/t/${slug}/help` : "/help" },
    slug && { id: "open_project", label: "Open project", href: `/t/${slug}` },
    p.help && { id: "show_ticket", label: `Show ticket ${p.help.code}`, href: `/help/${p.help.code}` },
  ].filter(Boolean) as { id: string; label: string; href: string }[];
  return (
    <nav aria-label="Passport actions">
      <p className="mb-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Actions</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="flex min-h-11 items-center justify-between gap-2 border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
            >
              {a.label} <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Back({ p }: { p: PrivatePassport }) {
  const c = p.consents;
  return (
    <PassportBack>
      <BackSection title="Skills">
        <Chips items={p.member.skills} empty="None yet" />
      </BackSection>
      <BackSection title="Focus">
        <Chips items={p.member.interests} empty="None yet" />
      </BackSection>
      <BackSection title="Team">
        {p.team ? (p.team.is_solo ? "Solo builder" : `${p.team.name} · ${p.team.size} builders · ${p.team.role}`) : "Looking for team"}
      </BackSection>
      <BackSection title="Next">{p.mission.title}</BackSection>
      <BackSection title="Milestones">
        {p.milestones.length ? (
          <ul className="space-y-0.5">
            {p.milestones.map((m, i) => (
              <li key={i}>
                {m.confidence === "verified" ? "✓ " : "○ "}
                {m.title}
                {m.confidence !== "verified" && <span className="text-ink/60"> (unverified)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink/60">None approved yet</span>
        )}
      </BackSection>
      <BackSection title="Help">{p.help ? `${p.help.code} · ${p.help.status.replace("_", " ")}` : "No open ticket"}</BackSection>
      <BackSection title="Sharing">
        <ul className="grid grid-cols-2 gap-x-2">
          {CONSENT_CATEGORIES.map((k) => (
            <li key={k} className="truncate">
              {c[k] ? "● " : "○ "}
              {k.replace(/_/g, " ")}
              <span className="sr-only">{c[k] ? " on" : " off"}</span>
            </li>
          ))}
        </ul>
      </BackSection>
      <BackSection title="Links">
        {[p.member.github_handle && c.teammate_discovery ? `github.com/${p.member.github_handle}` : null, p.member.x_handle && c.social_mention ? `x.com/${p.member.x_handle}` : null]
          .filter(Boolean)
          .join(" · ") || <span className="text-ink/60">Not shared</span>}
      </BackSection>
    </PassportBack>
  );
}

function Panel({ title, id, wide, children }: { title: string; id: string; wide?: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`border border-hairline bg-surface p-5 sm:p-6 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 id={`${id}-h`} className="mb-4 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActivationPanel({ p, ev }: { p: PrivatePassport; ev: Awaited<ReturnType<typeof getEvent>> }) {
  const a = p.activation;
  if (!a || a.status !== "active") {
    return (
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-3 font-plex text-sm text-bright">
          <StatusPill tone={a ? "pending" : "unverified"}>{a ? a.status.replace(/_/g, " ") : "Not started"}</StatusPill>
          {a ? "Pick up where you left off." : "Two minutes: confirm your registration and choose what you share."}
        </p>
        <Link href="/activate" className="inline-flex min-h-11 items-center bg-lime px-4 font-plex text-sm text-ink transition-colors hover:bg-bright">
          {a ? "Resume activation →" : "Start activation →"}
        </Link>
      </div>
    );
  }
  return (
    <dl className="grid gap-3 font-plex text-sm sm:grid-cols-2">
      <div>
        <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Receipt</dt>
        <dd className="mt-1 font-dots text-2xl text-bright">{a.receipt_code}</dd>
      </div>
      <div>
        <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Server time</dt>
        <dd className="mt-1 text-bright">{a.receipt_at ? formatEventTime(a.receipt_at, ev) : "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Kane browser check</dt>
        <dd className="mt-1">
          {a.kane_verified ? (
            <StatusPill tone="verified">Verified · run {a.kane_run_id}</StatusPill>
          ) : a.kane_run_id ? (
            <StatusPill tone="unverified">Reported · run {a.kane_run_id} · unverified</StatusPill>
          ) : (
            <span className="text-lightgray">Not run (optional)</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
