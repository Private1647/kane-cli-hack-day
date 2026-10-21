"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loop, type AcState } from "@/data/hackday";

// The Assurance loop as it actually runs: Codex builds, then calls Kane CLI;
// Kane drives the app in a real browser against the requirement's acceptance
// criteria and hands back a verdict with evidence and a fix prompt; Codex
// fixes and calls Kane again until every criterion is proven.
//
// Three live panels (Codex terminal, the app, Kane CLI terminal) play the
// script in `loop.story`, with the criteria checklist underneath. Anatomy-
// style behaviour: idle tour, pause on hover/focus/off-screen, ← → to step,
// one lime accent at a time, a still frame for reduced motion.

const STEP_MS = 3400;
const CURSOR_MS = 650;

const story = loop.story;
const LAST = story.length - 1;

type Target = "add" | "total" | "pay" | "confirm";
// Where Kane's cursor visits in the app, per app state, in click order.
const CURSOR_PATH: Record<string, Target[]> = {
  bug: ["add", "total"],
  done: ["add", "total", "pay", "confirm"],
};

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(reducedQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export default function AssuranceLoop({ className = "" }: { className?: string }) {
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
  const [step, setStep] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const shown = reduced ? LAST : step;
  const beat = story[shown];
  const paused = hovering || focused;
  const driving = beat.hop.from === "kane" && beat.hop.to === "app" && !reduced;
  const path = CURSOR_PATH[beat.app] ?? [];

  // Only animate while on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Idle tour.
  useEffect(() => {
    if (reduced || paused || !visible) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % story.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced, paused, visible]);

  // Kane's cursor walks the app's targets while it drives the browser.
  useEffect(() => {
    if (!driving || !visible) return;
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(i + 1, path.length - 1);
      setCursor(i);
    }, CURSOR_MS);
    return () => {
      window.clearInterval(id);
      setCursor(0);
    };
  }, [driving, visible, path.length, shown]);

  const go = (i: number) => setStep(((i % story.length) + story.length) % story.length);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(step + 1);
    else if (e.key === "ArrowLeft") go(step - 1);
    else return;
    e.preventDefault();
  };

  const active = (who: "codex" | "kane" | "app") => beat.hop.from === who;
  const target = (who: "codex" | "kane" | "app") => beat.hop.to === who;
  const cursorAt: Target | null = driving ? path[Math.min(cursor, path.length - 1)] ?? null : null;
  const proven = beat.ac.filter((a) => a === "proven").length;

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      aria-label="The Assurance loop: Codex builds and calls Kane CLI, Kane drives the app in a real browser against the requirement and returns a verdict with evidence and a fix prompt, Codex fixes and Kane reruns until every criterion is proven. Use the left and right arrow keys to step through."
      className={`outline-none focus-visible:ring-1 focus-visible:ring-lime focus-visible:ring-offset-4 focus-visible:ring-offset-surface ${className}`}
    >
      {/* Who is talking to whom right now. */}
      <Hop from={beat.hop.from} to={beat.hop.to} label={beat.hop.label} animate={!reduced} />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
        <Terminal name="Codex" role="your agent" lines={beat.codex} lit={active("codex")} target={target("codex")} stepKey={shown} />
        <AppMock state={beat.app} lit={active("app") || target("app")} cursorAt={cursorAt} />
        <Terminal name="Kane CLI" role="the verifier" lines={beat.kane} lit={active("kane")} target={target("kane")} stepKey={shown} />
      </div>

      {/* The requirement's acceptance criteria, proven one run at a time. */}
      <div className="mt-3 border border-dashed border-hairline bg-ink/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{loop.requirement}</p>
          <p className="font-plex text-xs text-lightgray">
            <span className={proven === loop.criteria.length ? "text-lime" : "text-bright"}>{proven}</span>/{loop.criteria.length} proven
          </p>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {loop.criteria.map((c, i) => (
            <Criterion key={c} n={i + 1} label={c} state={beat.ac[i]} />
          ))}
        </ul>
      </div>

      {/* Step readout. */}
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-5 border border-dashed border-hairline p-4" aria-live="polite">
        <p className="font-dots text-4xl leading-none font-black text-lime">{String(shown + 1).padStart(2, "0")}</p>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-pixel text-xs uppercase tracking-[0.2em] text-bright">{beat.title}</p>
            <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">
              {reduced ? "Still" : paused ? "Paused" : "Auto"}
            </p>
          </div>
          <p className="mt-2 font-plex text-sm leading-relaxed text-lightgray">{beat.caption}</p>
        </div>
      </div>

      {!reduced && (
        <ol className="mt-3 grid grid-cols-7 gap-1">
          {story.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === shown ? "step" : undefined}
                className={`group block w-full text-left`}
              >
                <span className={`block h-1 transition-colors ${i === shown ? "bg-lime" : i < shown ? "bg-[#5a6b1f]" : "bg-hairline group-hover:bg-lightgray"}`} />
                <span className={`mt-2 hidden font-pixel text-[9px] uppercase tracking-[0.15em] lg:block ${i === shown ? "text-bright" : "text-lightgray"}`}>
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-center font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">
        Nothing ships on the agent’s word alone.
      </p>
    </div>
  );
}

const ACTOR_NAME = { codex: "Codex", kane: "Kane CLI", app: "Your app" } as const;

// Panel order on screen, so the arrow points the way the message travels.
const ORDER = { codex: 0, app: 1, kane: 2 } as const;

function Hop({ from, to, label, animate }: { from: keyof typeof ACTOR_NAME; to: keyof typeof ACTOR_NAME; label: string; animate: boolean }) {
  const leftward = ORDER[from] > ORDER[to];
  const [left, right] = leftward ? [to, from] : [from, to];
  return (
    <div className="flex items-center justify-center gap-3 font-pixel text-[10px] uppercase tracking-[0.2em] sm:text-xs">
      <span className={left === from ? "text-lime" : "text-bright"}>{ACTOR_NAME[left]}</span>
      <span className="relative flex min-w-24 flex-1 items-center sm:max-w-72">
        {leftward && <span aria-hidden className="text-lime">◀</span>}
        {/* Dashes flowing from sender to receiver. */}
        <span
          aria-hidden
          className="h-px w-full bg-[length:10px_1px] bg-repeat-x [background-image:linear-gradient(90deg,var(--lime)_50%,transparent_50%)]"
          style={animate ? { animation: `hop-flow 600ms linear infinite${leftward ? " reverse" : ""}` } : undefined}
        />
        {!leftward && <span aria-hidden className="text-lime">▶</span>}
        <span className="absolute inset-x-0 -top-5 text-center text-lime">{label}</span>
      </span>
      <span className={right === from ? "text-lime" : "text-bright"}>{ACTOR_NAME[right]}</span>
    </div>
  );
}

function Terminal({
  name,
  role,
  lines,
  lit,
  target,
  stepKey,
}: {
  name: string;
  role: string;
  lines: string[];
  lit: boolean;
  target: boolean;
  stepKey: number;
}) {
  return (
    <div className={`flex min-h-36 flex-col border bg-ink lg:min-h-52 transition-colors duration-300 ${lit ? "border-lime" : target ? "border-lightgray" : "border-hairline"}`}>
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className={`font-pixel text-[10px] uppercase tracking-[0.2em] ${lit ? "text-lime" : "text-bright"}`}>{name}</span>
        <span className="font-plex text-[10px] text-lightgray">{role}</span>
      </div>
      <ul key={stepKey} className="flex-1 space-y-1.5 p-3 font-plex text-xs leading-relaxed">
        {lines.length === 0 && <li className="text-lightgray">waiting…</li>}
        {lines.map((l, i) => (
          <li
            key={l}
            className={`animate-rise break-words ${l.startsWith("✗") ? "text-bright" : l.startsWith("✓") ? "text-lime" : "text-lightgray"}`}
            style={{ animationDelay: `${i * 140}ms` }}
          >
            {l}
          </li>
        ))}
        {lit && <li aria-hidden className="h-3 w-1.5 animate-blink bg-lime" />}
      </ul>
    </div>
  );
}

function AppMock({ state, lit, cursorAt }: { state: "built" | "bug" | "fixed" | "done"; lit: boolean; cursorAt: Target | null }) {
  const totalBroken = state === "bug";
  const total = state === "built" ? "$0" : totalBroken ? "$0" : "$42";
  const ring = (t: Target) => (cursorAt === t ? "ring-1 ring-lime ring-offset-2 ring-offset-ink" : "");
  return (
    <div className={`relative flex min-h-36 flex-col border bg-ink lg:min-h-52 transition-colors duration-300 ${lit ? "border-lightgray" : "border-hairline"}`}>
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-hairline" />
          ))}
        </span>
        <span className="flex-1 truncate bg-surface px-2 py-0.5 font-plex text-[10px] text-lightgray">localhost:3000/shop</span>
        <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-bright">Your app</span>
      </div>
      <div className="flex-1 space-y-3 p-4 font-plex text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-bright">Laurel wreath · $42</span>
          <span className={`border border-hairline px-2 py-1 text-bright transition-shadow ${ring("add")}`}>Add to cart</span>
        </div>
        <div className={`flex items-center justify-between border-t border-dashed border-hairline pt-3 transition-shadow ${ring("total")}`}>
          <span className="text-lightgray">Cart total</span>
          <span className={totalBroken ? "border border-dashed border-bright px-1.5 text-bright line-through decoration-bright" : "text-bright"}>
            {total}
            {totalBroken && <span className="ml-1.5 no-underline">✗</span>}
          </span>
        </div>
        <div className="flex justify-end">
          <span className={`bg-bright px-2 py-1 text-ink transition-shadow ${ring("pay")}`}>Pay with test card</span>
        </div>
        <p className={`transition-opacity duration-500 ${state === "done" ? "opacity-100" : "opacity-0"} ${ring("confirm")} text-lime`}>
          ✓ Order confirmed #1042
        </p>
      </div>
      <span className="border-t border-hairline px-3 py-1.5 font-pixel text-[9px] uppercase tracking-[0.2em] text-lightgray">
        {state === "built" ? "new build" : state === "bug" ? "1 bug found" : state === "fixed" ? "fix deployed" : "all flows pass"}
      </span>
    </div>
  );
}

const AC_STYLE: Record<AcState, { tag: string; cls: string }> = {
  untested: { tag: "No run yet", cls: "border-hairline text-lightgray" },
  proven: { tag: "Proven", cls: "border-lime text-lime" },
  failing: { tag: "Failing", cls: "border-bright text-bright" },
  blocked: { tag: "Blocked", cls: "border-hairline text-lightgray" },
};

function Criterion({ n, label, state }: { n: number; label: string; state: AcState }) {
  const s = AC_STYLE[state];
  return (
    <li className={`flex items-start justify-between gap-3 border px-3 py-2 transition-colors duration-300 ${s.cls}`}>
      <span className="font-plex text-xs">
        <span className="text-lightgray">AC-{n} </span>
        {label}
      </span>
      <span className="shrink-0 font-pixel text-[9px] uppercase tracking-[0.15em]">{s.tag}</span>
    </li>
  );
}
