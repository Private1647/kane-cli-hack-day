"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { submissions } from "@/data/hackday";

/* ------------------------------------------------------------------------ */
/* Copy                                                                      */
/* ------------------------------------------------------------------------ */

const FINAL = submissions.final;
const TAGLINE = "Every piece you ship adds thrust. All four lights the afterburner.";
const STORAGE_KEY = "hackday:bundle";

const ARIA_LABEL =
  "Side cutaway of a jet engine on a thrust stand: intake and fan, compressor, combustor, turbine, " +
  "an afterburner with a fuel spray bar and three V-gutter flameholders, and a variable nozzle. " +
  "A load cell measures thrust. Each finished submission piece adds thrust; all seven light the afterburner.";

/** Which engine part an item drives. Index matches ITEMS. */
const PARTS = ["Fan + compressor", "Combustor", "Turbine", "Spray bar", "Gutter 1", "Gutter 2", "Gutter 3"];

type Item = { id: string; label: string; kind: "essential" | "content"; part: string };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ITEMS: Item[] = [
  ...FINAL.minimum.map((label) => ({ label, kind: "essential" as const })),
  ...FINAL.pickTwo.map((label) => ({ label, kind: "content" as const })),
].map((it, i) => ({ ...it, id: slug(it.label), part: PARTS[i] ?? "" }));

const N_ESS = FINAL.minimum.length;
const N_CONTENT = FINAL.pickTwo.length;

/* ------------------------------------------------------------------------ */
/* Thrust model                                                              */
/* ------------------------------------------------------------------------ */

type Phase = "idle" | "spooling" | "military" | "afterburner";

function analyse(ticked: readonly boolean[]) {
  const ess = ticked.slice(0, N_ESS).filter(Boolean).length;
  const content = ticked.slice(N_ESS).filter(Boolean).length;
  let phase: Phase;
  let thrust: number;
  if (ess < N_ESS) {
    phase = "idle";
    thrust = 6 + ess * 8 + content * 3; // ground idle: pieces nudge it, spools stay slow
  } else if (ess === N_ESS && content === N_CONTENT) {
    phase = "afterburner";
    thrust = 122;
  } else if (content >= 2) {
    phase = "military";
    thrust = 48 + content * 9;
  } else {
    phase = "spooling";
    thrust = 48 + content * 9;
  }
  return { ess, content, phase, thrust };
}

function statusFor(phase: Phase, content: number): string {
  switch (phase) {
    case "idle":
      return "Idle — finish the essentials";
    case "spooling": {
      const left = 2 - content;
      return `Spooling — add ${left} more content piece${left === 1 ? "" : "s"}`;
    }
    case "military":
      return "Military power — shipped prize unlocked";
    case "afterburner":
      return "Afterburner — full bundle";
  }
}

const ALL_STATUSES = [
  statusFor("idle", 0),
  statusFor("spooling", 0),
  statusFor("military", 2),
  statusFor("afterburner", 4),
];

const MAX_THRUST = 122;

/* ------------------------------------------------------------------------ */
/* Palette                                                                   */
/* ------------------------------------------------------------------------ */

type Tone = { top: string; left: string; right: string };

const TONES = {
  plate: { top: "#1c1c1c", left: "#121212", right: "#0d0d0d" },
  base: { top: "#3a3a3a", left: "#2a2a2a", right: "#1a1a1a" },
  raised: { top: "#5a5a5a", left: "#3a3a3a", right: "#2a2a2a" },
  bright: { top: "#8a8a8a", left: "#5a5a5a", right: "#3a3a3a" },
} satisfies Record<string, Tone>;

const LIT: Tone = { top: "#daff52", left: "#b8d93f", right: "#86a324" };
const LIME = "#daff52";
const LIME_DEEP = "#1f2606";
const FILL_TRANSITION = "fill 250ms ease, stroke 250ms ease";

/* ------------------------------------------------------------------------ */
/* Geometry (side cutaway, screen units)                                      */
/* ------------------------------------------------------------------------ */

const CY = 156; // engine centreline
const WALL = 10;

/** Casing inner radius along the engine, intake lip to the nozzle hinge. */
const PROFILE: readonly [number, number][] = [
  [56, 74],
  [72, 70],
  [110, 67],
  [140, 66],
  [160, 60],
  [225, 46],
  [240, 46],
  [252, 54],
  [330, 54],
  [340, 50],
  [380, 52],
  [396, 54],
  [600, 54],
];

const NOZZLE_X0 = 600;
const NOZZLE_X1 = 656;
const nozzleExit = (open: number) => 38 + 12 * open;

/** Rotating blade discs. `ex` squashes the disc into an ellipse seen slightly off-axis. */
const DISCS = [
  { x: 125, R: 64, hub: 16, n: 12, spool: "lp", item: 0 },
  { x: 166, R: 56, hub: 22, n: 14, spool: "hp", item: 0 },
  { x: 190, R: 51, hub: 22, n: 14, spool: "hp", item: 0 },
  { x: 214, R: 46, hub: 22, n: 14, spool: "hp", item: 0 },
  { x: 346, R: 46, hub: 24, n: 16, spool: "hp", item: 2 },
  { x: 368, R: 48, hub: 24, n: 16, spool: "lp", item: 2 },
] as const;
const EX = 0.3;

const SPRAY_X = 436;
const GUTTER_X = 458;
const GUTTERS = [-30, 0, 30];
const SPRAY_DOTS = 18;

const DIAMONDS = [
  { x: 684, hl: 14, hh: 26 },
  { x: 714, hl: 12, hh: 20 },
  { x: 742, hl: 10, hh: 14 },
];

function polyline(points: readonly [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** Upper (sign -1) or lower (sign +1) casing wall as a closed band. */
function casingBand(sign: -1 | 1): string {
  const inner = PROFILE.map(([x, r]) => [x, CY + sign * r] as [number, number]);
  const outer = PROFILE.map(([x, r]) => [x, CY + sign * (r + WALL)] as [number, number]).reverse();
  return polyline([...inner, ...outer]);
}

function casingEdge(sign: -1 | 1): string {
  return polyline(PROFILE.map(([x, r]) => [x, CY + sign * (r + WALL)] as [number, number]));
}

function interiorPath(): string {
  const top = PROFILE.map(([x, r]) => [x, CY - r] as [number, number]);
  const bottom = PROFILE.map(([x, r]) => [x, CY + r] as [number, number]).reverse();
  return polyline([...top, ...bottom]);
}

function petal(sign: -1 | 1, open: number): string {
  const rE = nozzleExit(open);
  return polyline([
    [NOZZLE_X0, CY + sign * 54],
    [NOZZLE_X0, CY + sign * 64],
    [NOZZLE_X1, CY + sign * (rE + 9)],
    [NOZZLE_X1, CY + sign * rE],
  ]);
}

/* ------------------------------------------------------------------------ */
/* Primitives                                                                */
/* ------------------------------------------------------------------------ */

/** Solid block seen front-on with a shallow oblique top and right side (3 tones). */
function Block({
  x,
  y,
  w,
  h,
  d = 8,
  tone,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  d?: number;
  tone: Tone;
}) {
  const style = (fill: string) => ({ fill, transition: FILL_TRANSITION });
  return (
    <g stroke="#000" strokeWidth={1} strokeLinejoin="round">
      <polygon
        points={polyline([
          [x + w, y],
          [x + w + d, y - d],
          [x + w + d, y + h - d],
          [x + w, y + h],
        ])}
        style={style(tone.right)}
      />
      <polygon
        points={polyline([
          [x, y],
          [x + d, y - d],
          [x + w + d, y - d],
          [x + w, y],
        ])}
        style={style(tone.top)}
      />
      <rect x={x} y={y} width={w} height={h} style={style(tone.left)} />
    </g>
  );
}

function Label({
  x,
  y,
  tickTo,
  lit,
  children,
}: {
  x: number;
  y: number;
  tickTo?: number;
  lit: boolean;
  children: ReactNode;
}) {
  const color = lit ? LIME : "#7e7e7e";
  return (
    <g>
      {tickTo !== undefined && (
        <line
          x1={x}
          y1={y + 5}
          x2={x}
          y2={tickTo}
          strokeWidth={1}
          strokeDasharray="2 3"
          style={{ stroke: lit ? LIME : "#3a3a3a", transition: FILL_TRANSITION }}
        />
      )}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        className="font-pixel uppercase"
        fontSize={12}
        letterSpacing={2}
        style={{ fill: color, transition: FILL_TRANSITION }}
      >
        {children}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------------ */
/* Reduced-motion preference                                                 */
/* ------------------------------------------------------------------------ */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/* ------------------------------------------------------------------------ */
/* Simulation state (lives in a ref; painted straight to the DOM)            */
/* ------------------------------------------------------------------------ */

type Sim = {
  thrust: number; // eased kN
  spray: number; // 0..1 afterburner fuel spray
  flame: number; // 0..1 afterburner flame (lags the spray: it has to catch)
  nozzle: number; // 0..1 petal opening
  lp: number; // spool angles, radians
  hp: number;
  t: number; // seconds, for flicker and spray travel
  shownKn: number; // last integer written to the readouts
};

function persist(next: readonly boolean[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ITEMS.filter((_, i) => next[i]).map((it) => it.id)));
  } catch {}
}

/** Placeholder digits; the paint loop owns the text after mount. */
const INITIAL_KN = "006";

const DEMO_STEP_MS = 1500;
const DEMO_HOLD_MS = 4500;

/* ------------------------------------------------------------------------ */
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

export default function Afterburner({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [ticks, setTicks] = useState<boolean[]>(() => ITEMS.map(() => false));
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);
  const [lastChanged, setLastChanged] = useState<number | null>(null);
  const [demoCount, setDemoCount] = useState(0);
  const [inView, setInView] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const discRefs = useRef<(SVGGElement | null)[]>([]);
  const nozzleUpRef = useRef<SVGPolygonElement>(null);
  const nozzleDnRef = useRef<SVGPolygonElement>(null);
  const sprayRef = useRef<SVGGElement>(null);
  const ductFlameRef = useRef<SVGGElement>(null);
  const plumeRef = useRef<SVGGElement>(null);
  const diamondsRef = useRef<SVGGElement>(null);
  const dryRef = useRef<SVGGElement>(null);
  const cellTextRef = useRef<SVGTextElement>(null);
  const bigNumRef = useRef<HTMLSpanElement>(null);

  // Read saved ticks after hydration.
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        const ids = new Set(saved.filter((s): s is string => typeof s === "string"));
        // Reading browser storage has to wait until after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTicks(ITEMS.map((it) => ids.has(it.id)));
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Pause while scrolled out of view.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ---- idle demo tour (visual only, never persisted) ---- */

  const realCount = ticks.filter(Boolean).length;
  const demo = loaded && !touched && !reduced && realCount === 0;

  useEffect(() => {
    if (!demo || !inView) return;
    const delay = demoCount >= ITEMS.length ? DEMO_HOLD_MS : DEMO_STEP_MS;
    const id = window.setTimeout(() => {
      setDemoCount((c) => (c >= ITEMS.length ? 0 : c + 1));
    }, delay);
    return () => window.clearTimeout(id);
  }, [demo, inView, demoCount]);

  const shown = demo ? ITEMS.map((_, i) => i < demoCount) : ticks;
  const litItem = demo ? (demoCount > 0 && demoCount <= ITEMS.length ? demoCount - 1 : null) : lastChanged;
  const state = analyse(shown);
  const real = analyse(ticks);
  const afterburner = state.phase === "afterburner";
  /** Lime marks the part that just changed; once the afterburner lights, the flame owns it. */
  const litPart = afterburner ? null : litItem;
  const isLit = (i: number) => litPart === i;

  /* ---- user actions ---- */

  const toggle = useCallback((i: number) => {
    setTouched(true);
    setLastChanged(i);
    setTicks((prev) => {
      const next = prev.map((v, j) => (j === i ? !v : v));
      persist(next);
      return next;
    });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const i = ticks.findIndex((v) => !v);
      if (i >= 0) toggle(i);
      else setTouched(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const i = ticks.lastIndexOf(true);
      if (i >= 0) toggle(i);
      else setTouched(true);
    }
  };

  /* ---- animation ---- */

  const simRef = useRef<Sim>({ thrust: 6, spray: 0, flame: 0, nozzle: 0, lp: 0.4, hp: 1.1, t: 0, shownKn: -1 });
  const targetRef = useRef({ thrust: state.thrust, ab: afterburner ? 1 : 0 });
  const litRef = useRef<number | null>(litPart);

  useLayoutEffect(() => {
    targetRef.current = { thrust: state.thrust, ab: afterburner ? 1 : 0 };
    litRef.current = litPart;
  });

  const paint = useCallback(() => {
    const s = simRef.current;
    const lit = litRef.current;

    // Blade discs: each blade is a line from hub to tip on an ellipse; the
    // half of the disc facing us is drawn brighter.
    DISCS.forEach((d, di) => {
      const g = discRefs.current[di];
      if (!g) return;
      const angle = d.spool === "lp" ? s.lp : s.hp;
      const on = lit === d.item;
      for (let k = 0; k < d.n; k++) {
        const line = g.children[k] as SVGLineElement | undefined;
        if (!line) continue;
        const phi = angle + (k * Math.PI * 2) / d.n;
        const sn = Math.sin(phi);
        const cs = Math.cos(phi);
        line.setAttribute("x1", (d.x + d.hub * EX * sn).toFixed(2));
        line.setAttribute("y1", (CY - d.hub * cs).toFixed(2));
        line.setAttribute("x2", (d.x + d.R * EX * sn).toFixed(2));
        line.setAttribute("y2", (CY - d.R * cs).toFixed(2));
        const front = sn > 0;
        line.setAttribute("stroke", on ? (front ? LIME : "#86a324") : front ? "#8a8a8a" : "#3a3a3a");
      }
    });

    nozzleUpRef.current?.setAttribute("points", petal(-1, s.nozzle));
    nozzleDnRef.current?.setAttribute("points", petal(1, s.nozzle));

    // Fuel spray drifts downstream from the spray bar.
    const spray = sprayRef.current;
    if (spray) {
      for (let i = 0; i < SPRAY_DOTS; i++) {
        const c = spray.children[i] as SVGCircleElement | undefined;
        if (!c) continue;
        const travel = (s.t * 70 + i * 17) % 22;
        const y = CY - 42 + (i % 9) * 10.5 + (i < 9 ? 0 : 5);
        c.setAttribute("cx", (SPRAY_X + 5 + travel).toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        c.setAttribute("opacity", (s.spray * (1 - travel / 22)).toFixed(2));
      }
    }

    // Flicker: a few incommensurate sines; zero in reduced motion (t frozen).
    const n1 = Math.sin(s.t * 31) * 0.5 + Math.sin(s.t * 17.3 + 1) * 0.3 + Math.sin(s.t * 53 + 2) * 0.2;
    const n2 = Math.sin(s.t * 23 + 0.5) * 0.6 + Math.sin(s.t * 41 + 1.7) * 0.4;
    ductFlameRef.current?.setAttribute("opacity", (s.flame * (0.85 + 0.15 * n2)).toFixed(2));
    const plume = plumeRef.current;
    if (plume) {
      plume.setAttribute("opacity", s.flame.toFixed(2));
      const sx = 0.55 + 0.45 * s.flame + 0.05 * n1;
      const sy = 0.7 + 0.3 * s.flame + 0.03 * n2;
      plume.setAttribute(
        "transform",
        `translate(${NOZZLE_X1} ${CY}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-NOZZLE_X1} ${-CY})`,
      );
    }
    const diamonds = diamondsRef.current;
    if (diamonds) {
      for (let i = 0; i < diamonds.children.length; i++) {
        const el = diamonds.children[i] as SVGElement;
        el.setAttribute("opacity", (0.9 - i * 0.18 + 0.1 * Math.sin(s.t * (19 + i * 7) + i)).toFixed(2));
      }
    }

    // Dry exhaust shimmer below military power fades as the flame takes over.
    const dry = dryRef.current;
    if (dry) {
      dry.setAttribute("opacity", ((1 - s.flame) * Math.min(1, s.thrust / 66) * 0.9).toFixed(2));
      for (let i = 0; i < dry.children.length; i++) {
        (dry.children[i] as SVGLineElement).setAttribute("stroke-dashoffset", (-s.t * (40 + s.thrust)).toFixed(1));
      }
    }

    const kn = Math.round(s.thrust);
    if (kn !== s.shownKn) {
      s.shownKn = kn;
      const txt = String(kn).padStart(3, "0");
      if (cellTextRef.current) cellTextRef.current.textContent = txt;
      if (bigNumRef.current) bigNumRef.current.textContent = txt;
    }
  }, []);

  // Repaint after every render so React-managed changes (lit part) land in
  // the imperative attributes, and so the reduced-motion still frame is exact.
  useLayoutEffect(() => {
    if (reduced) {
      const s = simRef.current;
      const ab = targetRef.current.ab;
      Object.assign(s, { thrust: targetRef.current.thrust, spray: ab, flame: ab, nozzle: ab, t: 0 });
      s.shownKn = -1;
    }
    paint();
  });

  useEffect(() => {
    if (reduced || !inView) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      const s = simRef.current;
      const target = targetRef.current;
      const ease = (tau: number) => 1 - Math.exp(-dt / tau);

      s.thrust += (target.thrust - s.thrust) * ease(0.9);
      s.spray += (target.ab - s.spray) * ease(0.25);
      // The flame only catches once fuel is spraying; it blows out quickly.
      const flameTarget = target.ab && s.spray > 0.6 ? 1 : 0;
      s.flame += (flameTarget - s.flame) * ease(flameTarget ? 0.5 : 0.25);
      s.nozzle += (target.ab - s.nozzle) * ease(0.6);

      const frac = Math.max(0, s.thrust) / MAX_THRUST;
      s.lp += (0.15 + frac * 1.4) * Math.PI * 2 * dt;
      s.hp += (0.25 + frac * 2.2) * Math.PI * 2 * dt;
      s.t += dt;
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView, paint]);

  /* ---- render ---- */

  const status = statusFor(state.phase, state.content);
  const realStatus = statusFor(real.phase, real.content);
  const essTone = (i: number) => (isLit(i) ? LIT : TONES.base);

  return (
    <div
      className={`w-full max-w-[760px] font-plex ${className}`}
      onPointerDownCapture={() => setTouched(true)}
    >
      <div
        ref={wrapperRef}
        tabIndex={0}
        role="group"
        aria-roledescription="interactive diagram"
        aria-label="Shipping engine. Right arrow ticks the next piece of your bundle, left arrow unticks the last one."
        onKeyDown={onKeyDown}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
      >
        <svg viewBox="0 28 780 302" role="img" aria-label={ARIA_LABEL} className="block h-auto w-full">
          <defs>
            <linearGradient id="ab-duct" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={LIME} stopOpacity={0.1} />
              <stop offset="1" stopColor={LIME} stopOpacity={0.45} />
            </linearGradient>
            <linearGradient id="ab-core" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={LIME} stopOpacity={0.95} />
              <stop offset="1" stopColor={LIME} stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="ab-plume" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={LIME} stopOpacity={0.9} />
              <stop offset="0.6" stopColor={LIME} stopOpacity={0.35} />
              <stop offset="1" stopColor={LIME} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ab-glow" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#b8d93f" stopOpacity={0.35} />
              <stop offset="1" stopColor="#86a324" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* ---- test stand (furthest back) ---- */}
          <Block x={14} y={300} w={752} h={12} tone={TONES.plate} />
          {/* flexures the floating frame rides on */}
          {[176, 534].map((x) => (
            <Block key={x} x={x} y={270} w={6} h={30} d={4} tone={TONES.base} />
          ))}
          {/* floating frame */}
          <Block x={150} y={262} w={420} h={8} d={5} tone={TONES.raised} />
          {/* engine cradle pylons */}
          {[196, 480].map((x) => (
            <Block key={x} x={x} y={222} w={14} h={40} d={5} tone={TONES.base} />
          ))}
          {/* load cell: fixed pedestal, cell body, link rod to the frame */}
          <Block x={22} y={292} w={86} h={8} d={5} tone={TONES.base} />
          <line x1={108} y1={266} x2={150} y2={266} stroke="#5a5a5a" strokeWidth={3} />
          <circle cx={112} cy={266} r={3.5} fill="#2a2a2a" stroke="#8a8a8a" strokeWidth={1} />
          <circle cx={146} cy={266} r={3.5} fill="#2a2a2a" stroke="#8a8a8a" strokeWidth={1} />
          <Block x={22} y={252} w={86} h={40} d={6} tone={TONES.raised} />
          <rect x={30} y={259} width={70} height={26} fill="#0b0b0b" stroke="#000" />
          <text
            ref={cellTextRef}
            x={72}
            y={279}
            textAnchor="end"
            className="font-dots"
            fontSize={19}
            fill={LIME}
          >
            {INITIAL_KN}
          </text>
          <text x={76} y={279} className="font-pixel" fontSize={9} fill="#7e7e7e">
            kN
          </text>

          {/* ---- engine interior: far wall of the cut drum ---- */}
          <polygon points={interiorPath()} fill="#0f0f0f" stroke="none" />
          {[-24, 24].map((dy) => (
            <line key={dy} x1={110} y1={CY + dy} x2={600} y2={CY + dy} stroke="#1a1a1a" strokeWidth={1} />
          ))}

          {/* shaft and spinner */}
          <rect x={110} y={CY - 5} width={270} height={10} fill={TONES.raised.left} stroke="#000" />
          <line x1={110} y1={CY - 4} x2={380} y2={CY - 4} stroke={TONES.raised.top} strokeWidth={1.5} />
          <path
            d={`M100,${CY} Q104,${CY - 16} 125,${CY - 17} L125,${CY + 17} Q104,${CY + 16} 100,${CY} Z`}
            stroke="#000"
            style={{ fill: isLit(0) ? LIT.left : TONES.raised.left, transition: FILL_TRANSITION }}
          />
          {/* tail cone */}
          <path
            d={`M376,${CY - 24} L426,${CY} L376,${CY + 24} Z`}
            stroke="#000"
            style={{ fill: isLit(2) ? LIT.right : TONES.base.left, transition: FILL_TRANSITION }}
          />

          {/* combustor: annular liner with injectors and dilution holes */}
          {[-1, 1].map((sign) => {
            const y = sign < 0 ? CY - 46 : CY + 26;
            const t = essTone(1);
            return (
              <g key={sign}>
                <rect x={238} y={CY + sign * 36 - 3} width={10} height={6} style={{ fill: t.top }} stroke="#000" />
                <rect
                  x={248}
                  y={y}
                  width={78}
                  height={20}
                  stroke="#000"
                  style={{ fill: sign < 0 ? t.left : t.right, transition: FILL_TRANSITION }}
                />
                <line
                  x1={248}
                  y1={y + 1}
                  x2={326}
                  y2={y + 1}
                  strokeWidth={2}
                  style={{ stroke: t.top, transition: FILL_TRANSITION }}
                />
                {[262, 276, 290, 304, 318].map((x) => (
                  <circle
                    key={x}
                    cx={x}
                    cy={y + 11}
                    r={2.2}
                    style={{ fill: isLit(1) ? LIME_DEEP : "#0b0b0b", transition: FILL_TRANSITION }}
                  />
                ))}
              </g>
            );
          })}

          {/* blade discs: rim + hub, blades painted imperatively */}
          {DISCS.map((d, di) => {
            const on = isLit(d.item);
            return (
              <g key={d.x}>
                <ellipse
                  cx={d.x}
                  cy={CY}
                  rx={d.R * EX}
                  ry={d.R}
                  fill="none"
                  strokeWidth={1}
                  style={{ stroke: on ? "#86a324" : "#2a2a2a", transition: FILL_TRANSITION }}
                />
                <g
                  ref={(el) => {
                    discRefs.current[di] = el;
                  }}
                  strokeWidth={d.spool === "lp" ? 2.5 : 2}
                  strokeLinecap="round"
                >
                  {Array.from({ length: d.n }, (_, k) => (
                    <line key={k} />
                  ))}
                </g>
                <ellipse
                  cx={d.x}
                  cy={CY}
                  rx={d.hub * EX}
                  ry={d.hub}
                  stroke="#000"
                  style={{ fill: on ? LIT.right : TONES.raised.right, transition: FILL_TRANSITION }}
                />
              </g>
            );
          })}

          {/* afterburner: spray bar, then the V-gutter flameholders */}
          <rect
            x={SPRAY_X - 2}
            y={CY - 46}
            width={4}
            height={92}
            stroke="#000"
            style={{ fill: isLit(3) ? LIT.left : TONES.raised.left, transition: FILL_TRANSITION }}
          />
          <g ref={sprayRef}>
            {Array.from({ length: SPRAY_DOTS }, (_, i) => (
              <circle key={i} r={1.3} fill={LIME} opacity={0} />
            ))}
          </g>
          {GUTTERS.map((dy, gi) => {
            const y = CY + dy;
            const t = isLit(4 + gi) ? LIT : TONES.raised;
            return (
              <g key={dy}>
                <polygon
                  points={polyline([
                    [GUTTER_X, y],
                    [GUTTER_X + 16, y - 9],
                    [GUTTER_X + 16, y - 5],
                  ])}
                  stroke="#000"
                  style={{ fill: t.top, transition: FILL_TRANSITION }}
                />
                <polygon
                  points={polyline([
                    [GUTTER_X, y],
                    [GUTTER_X + 16, y + 5],
                    [GUTTER_X + 16, y + 9],
                  ])}
                  stroke="#000"
                  style={{ fill: t.right, transition: FILL_TRANSITION }}
                />
                <polygon
                  points={polyline([
                    [GUTTER_X - 2, y],
                    [GUTTER_X + 16, y - 5],
                    [GUTTER_X + 16, y + 5],
                  ])}
                  stroke="#000"
                  style={{ fill: t.left, transition: FILL_TRANSITION }}
                />
              </g>
            );
          })}

          {/* afterburner flame inside the duct, anchored on the gutters */}
          <g ref={ductFlameRef} opacity={0}>
            <polygon
              points={polyline([
                [GUTTER_X + 12, CY - 40],
                [NOZZLE_X0, CY - 52],
                [NOZZLE_X0, CY + 52],
                [GUTTER_X + 12, CY + 40],
              ])}
              fill="url(#ab-duct)"
            />
            {GUTTERS.map((dy) => (
              <polygon
                key={dy}
                points={polyline([
                  [GUTTER_X + 16, CY + dy - 4],
                  [NOZZLE_X0, CY + dy * 1.25 - 14],
                  [NOZZLE_X0, CY + dy * 1.25 + 14],
                  [GUTTER_X + 16, CY + dy + 4],
                ])}
                fill="url(#ab-core)"
              />
            ))}
          </g>

          {/* casing walls, drawn over the interior edges */}
          <polygon points={casingBand(-1)} stroke="#000" strokeLinejoin="round" fill={TONES.raised.left} />
          <polyline points={casingEdge(-1)} fill="none" stroke={TONES.raised.top} strokeWidth={3} />
          <polygon points={casingBand(1)} stroke="#000" strokeLinejoin="round" fill={TONES.raised.right} />
          {/* cut-face hatch on the upper wall */}
          {[300, 500].map((x) => (
            <line key={x} x1={x} y1={CY - 54} x2={x} y2={CY - 64} stroke="#2a2a2a" strokeWidth={1} />
          ))}

          {/* variable nozzle petals */}
          <polygon ref={nozzleUpRef} points={petal(-1, 0)} stroke="#000" strokeLinejoin="round" fill={TONES.bright.left} />
          <polygon ref={nozzleDnRef} points={petal(1, 0)} stroke="#000" strokeLinejoin="round" fill={TONES.bright.right} />

          {/* dry exhaust shimmer */}
          <g ref={dryRef} opacity={0} strokeWidth={1.5} strokeDasharray="10 14" stroke="#5a5a5a">
            {[-18, 0, 18].map((dy) => (
              <line key={dy} x1={NOZZLE_X1 + 4} y1={CY + dy} x2={770} y2={CY + dy * 0.8} />
            ))}
          </g>

          {/* plume with shock diamonds */}
          <g ref={plumeRef} opacity={0}>
            <path
              d={`M${NOZZLE_X1},${CY - 52} C700,${CY - 58} 740,${CY - 44} 778,${CY - 30} L778,${CY + 30} C740,${CY + 44} 700,${CY + 58} ${NOZZLE_X1},${CY + 52} Z`}
              fill="url(#ab-glow)"
            />
            <path
              d={`M${NOZZLE_X1},${CY - 48} C690,${CY - 44} 730,${CY - 26} 776,${CY - 10} L776,${CY + 10} C730,${CY + 26} 690,${CY + 44} ${NOZZLE_X1},${CY + 48} Z`}
              fill="url(#ab-plume)"
            />
            <g ref={diamondsRef}>
              {DIAMONDS.map((d) => (
                <polygon
                  key={d.x}
                  points={polyline([
                    [d.x - d.hl, CY],
                    [d.x, CY - d.hh],
                    [d.x + d.hl, CY],
                    [d.x, CY + d.hh],
                  ])}
                  fill={LIME}
                  stroke={LIME_DEEP}
                  strokeWidth={1}
                />
              ))}
            </g>
          </g>

          {/* labels: overlay, never occluded */}
          <Label x={125} y={64} tickTo={CY - 77} lit={isLit(0)}>
            Fan
          </Label>
          <Label x={195} y={46} tickTo={CY - 63} lit={isLit(0)}>
            Compressor
          </Label>
          <Label x={287} y={64} tickTo={CY - 64} lit={isLit(1)}>
            Combustor
          </Label>
          <Label x={357} y={46} tickTo={CY - 61} lit={isLit(2)}>
            Turbine
          </Label>
          <Label x={482} y={64} tickTo={CY - 64} lit={afterburner || (litPart !== null && litPart >= 3)}>
            Afterburner
          </Label>
          <Label x={630} y={46} tickTo={CY - 62} lit={false}>
            Nozzle
          </Label>
          <Label x={65} y={326} lit={false}>
            Load cell
          </Label>
        </svg>

        <p className="mt-2 text-center font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">
          {TAGLINE}
        </p>

        {/* Readout. Invisible copies of every status share one grid cell with
            the live one so the panel never changes height. */}
        <div className="mt-5 border border-dashed border-hairline bg-surface p-4">
          <div className="flex items-end gap-4">
            <div className="flex shrink-0 items-baseline gap-1">
              <span ref={bigNumRef} aria-hidden="true" className="font-dots text-5xl leading-none text-lime">
                {INITIAL_KN}
              </span>
              <span className="font-pixel text-[11px] uppercase tracking-[0.25em] text-lightgray">kN</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span aria-hidden="true" className="font-pixel text-[9px] uppercase tracking-[0.25em] text-lightgray">
                  Essentials {state.ess}/{N_ESS} · Content {state.content}/{N_CONTENT}
                </span>
                <span aria-hidden="true" className="font-pixel text-[9px] uppercase tracking-[0.25em] text-lightgray">
                  {demo ? "Demo" : "Live"}
                </span>
              </div>
              <div className="mt-2 grid" aria-hidden="true">
                {ALL_STATUSES.map((s) => (
                  <span
                    key={s}
                    className="invisible col-start-1 row-start-1 font-pixel text-[11px] uppercase tracking-[0.2em]"
                  >
                    {s}
                  </span>
                ))}
                <span
                  className={`col-start-1 row-start-1 font-pixel text-[11px] uppercase tracking-[0.2em] ${
                    afterburner ? "text-lime" : "text-bright"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-lightgray">{FINAL.closing}</p>
          {/* Screen readers hear the user's real state, never the demo tour. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {loaded ? `${realStatus}. ${real.thrust} kilonewtons.` : ""}
          </p>
        </div>
      </div>

      {/* Checklist */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {(["essential", "content"] as const).map((kind) => (
          <div key={kind}>
            <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">
              {kind === "essential" ? `Essentials · all ${N_ESS}` : "Content · pick two"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ITEMS.map((it, i) => {
                if (it.kind !== kind) return null;
                const on = ticks[i];
                return (
                  <button
                    key={it.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(i)}
                    className={`flex items-center gap-2 border border-dashed px-3 py-2 text-left font-pixel text-[10px] uppercase tracking-[0.2em] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
                      on ? "border-lime bg-lime-deep text-lime" : "border-hairline text-lightgray hover:text-bright"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block size-2.5 border ${on ? "border-lime bg-lime" : "border-lightgray"}`}
                    />
                    <span>{it.label}</span>
                    <span aria-hidden="true" className="text-[8px] tracking-[0.15em] opacity-60">
                      {it.part}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-lightgray">
        {FINAL.minimumNote} {FINAL.fullBundle}
      </p>
    </div>
  );
}
