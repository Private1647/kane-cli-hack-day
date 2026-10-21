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
      className={`border border-hairline bg-ink shadow-[0_30px_80px_-30px_rgba(218,255,82,0.12)] outline-none focus-visible:ring-1 focus-visible:ring-lime focus-visible:ring-offset-4 focus-visible:ring-offset-surface ${className}`}
    >
      {/* Window chrome, so the fold reads as a running demo. */}
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          {["bg-[#3a3a3a]", "bg-[#3a3a3a]", "bg-lime"].map((c, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${c}`} />
          ))}
        </span>
        <span className="truncate font-plex text-xs whitespace-nowrap text-bright">assurance-loop.demo</span>
        <span className="hidden font-plex text-xs text-lightgray sm:inline">— codex × kane-cli</span>
        <span className="ml-auto font-pixel text-[10px] whitespace-nowrap uppercase tracking-[0.2em] text-lime">Loop {beat.round}</span>
        <span className="hidden font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray sm:inline">
          {reduced ? "Still" : paused ? "Paused" : "Auto"}
        </span>
        {!reduced && (
          <button
            type="button"
            onClick={() => go(0)}
            className="border border-hairline px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray transition-colors hover:border-lime hover:text-lime"
          >
            Replay
          </button>
        )}
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        {/* The loop itself: who's talking, and the ring closing as criteria are proven. */}
        <div className="flex flex-col">
          <LoopDial hop={beat.hop} ac={beat.ac} animate={!reduced} ship={shown === LAST} />
          <div className="mt-4 border border-dashed border-hairline p-4" aria-live="polite">
            <div className="flex items-baseline gap-3">
              <span className="font-dots text-3xl leading-none font-black text-lime">{String(shown + 1).padStart(2, "0")}</span>
              <span className="font-pixel text-xs uppercase tracking-[0.2em] text-bright">{beat.title}</span>
            </div>
            <p className="mt-3 font-plex text-sm leading-relaxed text-lightgray">{beat.caption}</p>
          </div>
        </div>

        {/* The actors at work. */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Terminal name="Codex" role="your agent" lines={beat.codex} lit={active("codex")} target={target("codex")} stepKey={shown} />
            <Terminal name="Kane CLI" role="the verifier" lines={beat.kane} lit={active("kane")} target={target("kane")} stepKey={shown} />
          </div>
          <AppMock state={beat.app} lit={active("app") || target("app")} cursorAt={cursorAt} />
          <div className="border border-dashed border-hairline p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">{loop.requirement}</p>
              <p className="font-plex text-xs text-lightgray">
                <span className={proven === loop.criteria.length ? "text-lime" : "text-bright"}>{proven}</span>/{loop.criteria.length} proven
              </p>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {loop.criteria.map((c, i) => (
                <Criterion key={c} n={i + 1} label={c} state={beat.ac[i]} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {!reduced && (
        <ol className="grid grid-cols-7 gap-1 border-t border-hairline px-4 py-3">
          {story.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === shown ? "step" : undefined}
                className="group block w-full text-left"
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
    </div>
  );
}

// The loop dial: Codex, Kane CLI and the app as a triangle inside a ring of
// dots. The active hop's edge carries a lime packet from sender to receiver;
// the ring is split into one arc per acceptance criterion and closes, arc by
// arc, as criteria are proven — an ouroboros that completes when all pass.
const DIAL = 320;
const C = DIAL / 2;
const RING_R = 146;
const NODE_R = 84;
const DOTS = 72;
// Rounded so server and browser render identical SVG (no hydration mismatch).
const r2 = (v: number) => Math.round(v * 100) / 100;
const polar = (deg: number, r: number) => [r2(C + r * Math.cos((deg * Math.PI) / 180)), r2(C + r * Math.sin((deg * Math.PI) / 180))] as const;

const NODES = {
  codex: { label: "Codex", at: polar(-90, NODE_R) },
  kane: { label: "Kane CLI", at: polar(30, NODE_R) },
  app: { label: "Your app", at: polar(150, NODE_R) },
} as const;
type NodeId = keyof typeof NODES;

const ARC_STYLE: Record<AcState, string> = {
  proven: "#daff52",
  failing: "#f2f2f2",
  blocked: "#2c2d2f",
  untested: "#2c2d2f",
};

function LoopDial({
  hop,
  ac,
  animate,
  ship,
}: {
  hop: { from: NodeId; to: NodeId; label: string };
  ac: AcState[];
  animate: boolean;
  ship: boolean;
}) {
  const per = DOTS / ac.length;
  const proven = ac.filter((a) => a === "proven").length;
  const [fx, fy] = NODES[hop.from].at;
  const [tx, ty] = NODES[hop.to].at;
  const edges: [NodeId, NodeId][] = [
    ["codex", "kane"],
    ["kane", "app"],
    ["app", "codex"],
  ];
  const isActive = (a: NodeId, b: NodeId) => (hop.from === a && hop.to === b) || (hop.from === b && hop.to === a);
  return (
    <figure className="mx-auto w-full max-w-sm">
      <svg viewBox={`0 0 ${DIAL} ${DIAL}`} role="img" aria-label={`${NODES[hop.from].label} to ${NODES[hop.to].label}: ${hop.label}. ${proven} of ${ac.length} criteria proven.`} className="block w-full">
        {/* Ring of dots, one arc per criterion, starting at the top. */}
        {Array.from({ length: DOTS }, (_, i) => {
          const arc = Math.floor(i / per);
          const inArc = i % per;
          if (inArc === per - 1) return null; // gap between arcs
          const state = ac[arc];
          // A failing criterion draws as a broken arc.
          if (state === "failing" && inArc % 2 === 1) return null;
          const [x, y] = polar(-90 + (i / DOTS) * 360 + 360 / DOTS / 2, RING_R);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={state === "proven" ? 3.4 : 2.6}
              fill={ARC_STYLE[state]}
              style={{ transition: "fill 300ms, r 300ms", transitionDelay: state === "proven" ? `${inArc * 25}ms` : "0ms" }}
            />
          );
        })}
        {/* Criterion labels on the ring. */}
        {ac.map((state, k) => {
          const [lx, ly] = polar(-90 + ((k + 0.5) * 360) / ac.length, RING_R - 18);
          return (
            <text key={k} x={lx} y={r2(ly + 3)} textAnchor="middle" className="font-pixel" fontSize={8} letterSpacing={1} fill={state === "proven" ? "#daff52" : "#7e7e7e"}>
              AC-{k + 1}
            </text>
          );
        })}

        {/* Triangle edges between the three actors. */}
        {edges.map(([a, b]) => {
          const [ax, ay] = NODES[a].at;
          const [bx, by] = NODES[b].at;
          const lit = isActive(a, b);
          return (
            <line
              key={`${a}-${b}`}
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke={lit ? "#daff52" : "#37383a"}
              strokeWidth={lit ? 1.5 : 1}
              strokeDasharray={lit ? "4 4" : undefined}
              style={{ transition: "stroke 300ms" }}
            />
          );
        })}

        {/* The packet travelling from sender to receiver. */}
        <circle r={5} fill="#daff52" cx={animate ? undefined : r2((fx + tx) / 2)} cy={animate ? undefined : r2((fy + ty) / 2)}>
          {animate && <animateMotion key={`${hop.from}-${hop.to}`} dur="1.1s" repeatCount="indefinite" path={`M${fx},${fy} L${tx},${ty}`} />}
        </circle>

        {/* Actor nodes. */}
        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const [x, y] = NODES[id].at;
          const from = hop.from === id;
          const to = hop.to === id;
          return (
            <g key={id}>
              <rect
                x={r2(x - 36)}
                y={r2(y - 13)}
                width={72}
                height={26}
                fill={from ? "#daff52" : "#0b0b0b"}
                stroke={from ? "#daff52" : to ? "#f2f2f2" : "#37383a"}
                style={{ transition: "fill 300ms, stroke 300ms" }}
              />
              <text x={x} y={r2(y + 3)} textAnchor="middle" className="font-pixel" fontSize={8} letterSpacing={1.2} fill={from ? "#000" : "#f2f2f2"}>
                {NODES[id].label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Centre: how much of the requirement is proven. */}
        <text x={C} y={C + 14} textAnchor="middle" className="font-dots" fontSize={30} fontWeight={900} fill={ship ? "#daff52" : "#f2f2f2"}>
          {proven}/{ac.length}
        </text>
        <text x={C} y={C + 28} textAnchor="middle" className="font-pixel" fontSize={7} letterSpacing={1.4} fill="#7e7e7e">
          PROVEN
        </text>
      </svg>
      <figcaption className="mt-3 text-center font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">
        {NODES[hop.from].label} → {NODES[hop.to].label} · {hop.label}
      </figcaption>
    </figure>
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
