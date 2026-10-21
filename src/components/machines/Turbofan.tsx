"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { challenge } from "@/data/hackday";

/* ------------------------------------------------------------------------ */
/* Copy                                                                      */
/* ------------------------------------------------------------------------ */

const BARS = challenge.bars;
const TAGLINE = "Three bars, three spools. Clear all three for take-off thrust.";
const STORAGE_KEY = "hackday:bars";

const ARIA_LABEL =
  "Side view of a high-bypass turbofan hung from an overhead thrust frame, upper half cut away. " +
  "Spool 1 is the fan and its low-pressure turbine, spool 2 the intermediate compressor and turbine, " +
  "spool 3 the high-pressure compressor, combustor and turbine. A load cell on the frame reads thrust. " +
  "Each bar your project clears spins up its spool; all three give take-off thrust.";

type SpoolDef = { name: string; lx: number; ly: number; tickTo: number };

/* ------------------------------------------------------------------------ */
/* Thrust model                                                              */
/* ------------------------------------------------------------------------ */

const IDLE_KN = 14;
const MAX_KN = 334;
const thrustFor = (n: number) => Math.round(IDLE_KN + ((MAX_KN - IDLE_KN) * n) / 3);

function statusFor(n: number): string {
  if (n <= 0) return "Idle — clear your first bar";
  if (n >= 3) return "Take-off thrust — ready to demo";
  return `Spooling — ${n}/3 bars cleared`;
}

const ALL_STATUSES = [statusFor(0), statusFor(1), statusFor(3)];

/** Visual spool speeds, rev/s, at idle and at take-off. HP turns fastest, the fan slowest. */
const IDLE_RPS = [0.08, 0.14, 0.22];
const FULL_RPS = [0.62, 1.05, 1.5];
/** The IP spool counter-rotates, as on a three-shaft engine. */
const DIR = [1, -1, 1];

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
/* Geometry (side view, screen units)                                        */
/* ------------------------------------------------------------------------ */

// Rounded to 0.01px so server and browser render identical SVG attributes
// (float noise would otherwise cause hydration mismatches).
const r2 = (v: number) => Math.round(v * 100) / 100;

const CY = 232; // engine centreline
const EX = 0.3; // blade discs squashed into ellipses, seen slightly off-axis

type Profile = readonly (readonly [number, number])[];

/** Fan case / nacelle inner wall (x, radius). */
const NAC_IN: Profile = [
  [80, 88],
  [100, 90],
  [130, 92],
  [175, 92],
  [230, 90],
  [320, 86],
  [400, 78],
  [420, 74],
];
/** Nacelle outer skin. */
const NAC_OUT: Profile = [
  [80, 95],
  [100, 101],
  [140, 104],
  [230, 104],
  [320, 98],
  [400, 86],
  [420, 78],
];
/** Core cowl outer skin: the inner wall of the bypass duct. */
const CORE_OUT: Profile = [
  [182, 50],
  [200, 54],
  [260, 56],
  [340, 58],
  [420, 58],
  [480, 54],
  [560, 46],
  [600, 42],
];
/** Core gas-path outer wall. */
const CORE_IN: Profile = [
  [184, 46],
  [200, 46],
  [240, 42],
  [250, 38],
  [320, 30],
  [332, 30],
  [340, 38],
  [384, 38],
  [392, 36],
  [410, 38],
  [430, 42],
  [450, 44],
  [540, 42],
  [600, 36],
];

type Pt = readonly [number, number];

function pts(points: readonly Pt[]): string {
  return points.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ");
}

const up = (p: Profile): Pt[] => p.map(([x, r]) => [x, CY - r] as const);
const down = (p: Profile): Pt[] => p.map(([x, r]) => [x, CY + r] as const);

/** Upper cut band between two profiles that share their x stations at the ends. */
function band(inner: Profile, outer: Profile): string {
  return pts([...up(inner), ...up(outer).reverse()]);
}

/** Exterior silhouette below the centreline from x0 to the profile, banded from `from` to `to` of the radius. */
function lowerSkin(p: Profile, from: number, to: number): string {
  const a = p.map(([x, r]) => [x, CY + r * from] as const);
  const b = p.map(([x, r]) => [x, CY + r * to] as const).reverse();
  return pts([...a, ...b]);
}

const SPOOLS: SpoolDef[] = [
  { name: "Fan", lx: 150, ly: 40, tickTo: CY - 92 },
  { name: "IP", lx: 214, ly: 68, tickTo: CY - 45 },
  { name: "HP", lx: 276, ly: 96, tickTo: CY - 36 },
];

/** Rotating blade discs; `spool` indexes SPOOLS / BARS. */
const DISCS = [
  { x: 150, R: 90, hub: 22, n: 22, spool: 0, w: 3 }, // fan
  { x: 196, R: 44, hub: 20, n: 16, spool: 1, w: 2 }, // IP compressor
  { x: 214, R: 43, hub: 20, n: 16, spool: 1, w: 2 },
  { x: 232, R: 41, hub: 20, n: 16, spool: 1, w: 2 },
  { x: 258, R: 36, hub: 18, n: 14, spool: 2, w: 1.8 }, // HP compressor
  { x: 276, R: 34, hub: 18, n: 14, spool: 2, w: 1.8 },
  { x: 294, R: 32, hub: 18, n: 14, spool: 2, w: 1.8 },
  { x: 312, R: 30, hub: 18, n: 14, spool: 2, w: 1.8 },
  { x: 400, R: 34, hub: 20, n: 16, spool: 2, w: 2 }, // HP turbine
  { x: 424, R: 38, hub: 20, n: 16, spool: 1, w: 2 }, // IP turbine
  { x: 462, R: 42, hub: 22, n: 18, spool: 0, w: 2 }, // LP turbine
  { x: 486, R: 42, hub: 22, n: 18, spool: 0, w: 2 },
  { x: 510, R: 42, hub: 22, n: 18, spool: 0, w: 2 },
  { x: 534, R: 41, hub: 22, n: 18, spool: 0, w: 2 },
] as const;

/** Concentric shafts: LP innermost and longest, HP the short outer drum. */
const SHAFTS = [
  { x0: 150, x1: 546, r: 5, spool: 0 },
  { x0: 196, x1: 430, r: 10, spool: 1 },
  { x0: 252, x1: 404, r: 15, spool: 2 },
] as const;

/** Airflow streaks: intake and bypass (upper), bypass jet and core jet (both halves). */
const STREAKS: Pt[][] = (() => {
  const bypass = (dr: number): Profile => [
    [14, 60 + dr],
    [80, 62 + dr],
    [150, 68 + dr],
    [200, 72 + dr],
    [300, 71 + dr],
    [420, 66],
    [560, 62 + dr * 0.5],
    [740, 58 + dr],
  ];
  const coreIn: Profile = [
    [14, 28],
    [100, 32],
    [150, 42],
    [182, 47],
  ];
  const jet: Profile = [
    [420, 64],
    [560, 61],
    [740, 57],
  ];
  const coreJet: Profile = [
    [604, 30],
    [660, 25],
    [740, 21],
  ];
  return [up(bypass(-6)), up(bypass(6)), up(coreIn), down(jet), up(coreJet), down(coreJet)];
})();

const NOZZLE_X0 = 580;
const NOZZLE_X1 = 600;

/* ------------------------------------------------------------------------ */
/* Primitives                                                                */
/* ------------------------------------------------------------------------ */

/** Solid block seen front-on with a shallow oblique top and right side (3 tones). */
function Block({ x, y, w, h, d = 8, tone }: { x: number; y: number; w: number; h: number; d?: number; tone: Tone }) {
  const style = (fill: string) => ({ fill, transition: FILL_TRANSITION });
  return (
    <g stroke="#000" strokeWidth={1} strokeLinejoin="round">
      <polygon
        points={pts([
          [x + w, y],
          [x + w + d, y - d],
          [x + w + d, y + h - d],
          [x + w, y + h],
        ])}
        style={style(tone.right)}
      />
      <polygon
        points={pts([
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
  return (
    <g>
      {tickTo !== undefined && (
        <line
          x1={x}
          y1={tickTo > y ? y + 5 : y - 13}
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
        fontSize={11}
        letterSpacing={2}
        style={{ fill: lit ? LIME : "#7e7e7e", transition: FILL_TRANSITION }}
      >
        {children}
      </text>
    </g>
  );
}

/** Two-line spool label: marker + "Spool N · part", then the bar title; dashed tick down to the spool. */
function SpoolLabel({ i, lit, cleared }: { i: number; lit: boolean; cleared: boolean }) {
  const s = SPOOLS[i];
  const tick = lit ? LIME : "#3a3a3a";
  return (
    <g>
      <line
        x1={s.lx}
        y1={s.ly + 1}
        x2={s.lx}
        y2={s.tickTo}
        strokeWidth={1}
        strokeDasharray="2 3"
        style={{ stroke: tick, transition: FILL_TRANSITION }}
      />
      <rect
        x={s.lx - 3.5}
        y={s.ly - 7}
        width={7}
        height={7}
        strokeWidth={1}
        style={{
          fill: cleared ? (lit ? LIME : "#8a8a8a") : "#0b0b0b",
          stroke: lit ? LIME : cleared ? "#8a8a8a" : "#5a5a5a",
          transition: FILL_TRANSITION,
        }}
      />
      <text
        x={s.lx + 9}
        y={s.ly}
        className="font-pixel uppercase"
        fontSize={10}
        letterSpacing={2}
        style={{ fill: lit ? LIME : "#7e7e7e", transition: FILL_TRANSITION }}
      >
        {`Spool ${i + 1} · ${s.name}`}
      </text>
      <text
        x={s.lx + 9}
        y={s.ly + 12}
        className="font-pixel uppercase"
        fontSize={9}
        letterSpacing={1}
        style={{ fill: lit ? LIME : "#c4c4c4", transition: FILL_TRANSITION }}
      >
        {BARS[i]?.title}
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
  w: number[]; // spool speeds, rev/s (eased)
  a: number[]; // spool angles, radians
  glow: number; // 0..1 exhaust glow at take-off thrust
  flow: number; // px travelled by the airflow streaks
  t: number; // seconds, for flicker
  shownKn: number;
  shownPct: number;
};

type Preview = { p: number; mode: "drag" | "takeoff"; t0: number; p0: number };

const STILL_ANGLES = [0.2, 0.55, 0.9];
const INITIAL_KN = "014";

const DEMO_STEP_MS = 1500;
const DEMO_HOLD_MS = 4500;
const RELEASE_MS = 1500;
const TAKEOFF_MS = 3000;
const TAKEOFF_RAMP_S = 2.2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

function persist(next: readonly boolean[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

/* ------------------------------------------------------------------------ */
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

export default function Turbofan({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [bars, setBars] = useState<boolean[]>(() => BARS.map(() => false));
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);
  const [lastChanged, setLastChanged] = useState<number | null>(null);
  const [demoCount, setDemoCount] = useState(0);
  const [inView, setInView] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [previewFull, setPreviewFull] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const discRefs = useRef<(SVGGElement | null)[]>([]);
  const streaksRef = useRef<SVGGElement>(null);
  const plumeRef = useRef<SVGGElement>(null);
  const cellTextRef = useRef<SVGTextElement>(null);
  const bigNumRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  const previewRef = useRef<Preview | null>(null);
  const previewFullRef = useRef(false);
  const releaseTimer = useRef<number | undefined>(undefined);
  const dragRef = useRef<{ x0: number; p0: number; w: number; moved: boolean } | null>(null);

  // Read saved bars after hydration.
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        // Reading browser storage has to wait until after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBars(BARS.map((_, i) => saved[i] === true));
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

  useEffect(() => () => window.clearTimeout(releaseTimer.current), []);

  /* ---- idle demo tour (visual only, never persisted) ---- */

  const realCount = bars.filter(Boolean).length;
  const demo = loaded && !touched && !reduced && realCount === 0;

  useEffect(() => {
    if (!demo || !inView) return;
    const delay = demoCount >= BARS.length ? DEMO_HOLD_MS : DEMO_STEP_MS;
    const id = window.setTimeout(() => {
      setDemoCount((c) => (c >= BARS.length ? 0 : c + 1));
    }, delay);
    return () => window.clearTimeout(id);
  }, [demo, inView, demoCount]);

  const shown = demo ? BARS.map((_, i) => i < demoCount) : bars;
  const shownCount = shown.filter(Boolean).length;
  const litSpoolRaw = demo ? (demoCount > 0 && demoCount <= BARS.length ? demoCount - 1 : null) : lastChanged;
  /** Exactly one lime part: the spool that just changed, or the exhaust at take-off thrust. */
  const exhaustLit = shownCount === BARS.length || (previewing && previewFull);
  const litSpool = exhaustLit ? null : litSpoolRaw;
  const isLit = (i: number) => litSpool === i;

  /* ---- user actions ---- */

  const toggle = useCallback((i: number) => {
    setTouched(true);
    setLastChanged(i);
    setBars((prev) => {
      const next = prev.map((v, j) => (j === i ? !v : v));
      persist(next);
      return next;
    });
  }, []);

  const setFull = useCallback((full: boolean) => {
    if (full !== previewFullRef.current) {
      previewFullRef.current = full;
      setPreviewFull(full);
    }
  }, []);

  const endPreview = useCallback(() => {
    window.clearTimeout(releaseTimer.current);
    previewRef.current = null;
    setPreviewing(false);
    setFull(false);
  }, [setFull]);

  const startPreview = useCallback(
    (p: number, mode: Preview["mode"]) => {
      window.clearTimeout(releaseTimer.current);
      const prev = previewRef.current;
      previewRef.current = { p, mode, t0: performance.now(), p0: prev?.p ?? p };
      setPreviewing(true);
      setFull(p >= 0.995);
    },
    [setFull],
  );

  const scheduleRelease = useCallback(
    (ms: number) => {
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = window.setTimeout(endPreview, ms);
    },
    [endPreview],
  );

  const currentThrottle = () => previewRef.current?.p ?? realCount / BARS.length;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== " ") return;
    e.preventDefault();
    setTouched(true);
    if (reduced) return;
    if (e.key === " ") {
      if (e.repeat) return;
      startPreview(currentThrottle(), "takeoff");
      scheduleRelease(TAKEOFF_MS);
      return;
    }
    const step = e.key === "ArrowRight" ? 0.1 : -0.1;
    startPreview(clamp01(Math.round((currentThrottle() + step) * 10) / 10), "drag");
    scheduleRelease(RELEASE_MS);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setTouched(true);
    if (reduced || (e.pointerType === "mouse" && e.button !== 0)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { x0: e.clientX, p0: currentThrottle(), w: Math.max(1, rect.width), moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    startPreview(clamp01(d.p0 + dx / (d.w * 0.7)), "drag");
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) scheduleRelease(RELEASE_MS);
  };

  /* ---- animation ---- */

  const fullThrust = thrustFor(shownCount);
  const simRef = useRef<Sim>({
    thrust: IDLE_KN,
    w: [...IDLE_RPS],
    a: [...STILL_ANGLES],
    glow: 0,
    flow: 0,
    t: 0,
    shownKn: -1,
    shownPct: -1,
  });
  const targetRef = useRef({ shown, thrust: fullThrust, glow: exhaustLit ? 1 : 0 });
  const litRef = useRef<number | null>(litSpool);

  useLayoutEffect(() => {
    targetRef.current = { shown, thrust: fullThrust, glow: shownCount === BARS.length ? 1 : 0 };
    litRef.current = litSpool;
  });

  const paint = useCallback(() => {
    const s = simRef.current;
    const lit = litRef.current;

    // Blade discs: each blade is a line from hub to tip on an ellipse; the
    // half of the disc facing us is drawn brighter.
    DISCS.forEach((d, di) => {
      const g = discRefs.current[di];
      if (!g) return;
      const angle = s.a[d.spool];
      const on = lit === d.spool;
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

    const frac = clamp01((s.thrust - IDLE_KN) / (MAX_KN - IDLE_KN));
    const streaks = streaksRef.current;
    if (streaks) {
      streaks.setAttribute("opacity", (0.3 + 0.6 * frac).toFixed(2));
      for (let i = 0; i < streaks.children.length; i++) {
        (streaks.children[i] as SVGElement).setAttribute("stroke-dashoffset", (-s.flow - i * 7).toFixed(1));
      }
    }

    const flicker = Math.sin(s.t * 23) * 0.5 + Math.sin(s.t * 37 + 1.3) * 0.5;
    plumeRef.current?.setAttribute("opacity", (s.glow * (0.9 + 0.1 * flicker)).toFixed(2));

    const kn = Math.round(s.thrust);
    if (kn !== s.shownKn) {
      s.shownKn = kn;
      const txt = String(kn).padStart(3, "0");
      if (cellTextRef.current) cellTextRef.current.textContent = txt;
      if (bigNumRef.current) bigNumRef.current.textContent = txt;
    }
    const pv = previewRef.current;
    const pct = pv ? Math.round(pv.p * 100) : -1;
    if (pctRef.current && pct !== s.shownPct) {
      s.shownPct = pct;
      pctRef.current.textContent = `${Math.max(0, pct)}%`;
    } else if (!pctRef.current) {
      s.shownPct = -1;
    }
  }, []);

  // Repaint after every render so React-managed changes (lit spool) land in
  // the imperative attributes, and so the reduced-motion still frame is exact.
  useLayoutEffect(() => {
    if (reduced) {
      const s = simRef.current;
      const tg = targetRef.current;
      Object.assign(s, { thrust: tg.thrust, glow: tg.glow, a: [...STILL_ANGLES], flow: 0, t: 0 });
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

      // Take-off run: throttle ramps from wherever it was to full, then holds.
      const pv = previewRef.current;
      if (pv && pv.mode === "takeoff") {
        const e = (now - pv.t0) / 1000;
        pv.p = pv.p0 + (1 - pv.p0) * smooth(clamp01(e / TAKEOFF_RAMP_S));
        setFull(pv.p >= 0.995);
      }

      const thrustTarget = pv ? IDLE_KN + (MAX_KN - IDLE_KN) * pv.p : target.thrust;
      const glowTarget = pv ? (pv.p >= 0.995 ? 1 : 0) : target.glow;
      s.thrust += (thrustTarget - s.thrust) * ease(pv ? 0.5 : 0.9);
      s.glow += (glowTarget - s.glow) * ease(0.35);

      for (let i = 0; i < 3; i++) {
        const f = pv ? pv.p : target.shown[i] ? 1 : 0;
        const w = IDLE_RPS[i] + (FULL_RPS[i] - IDLE_RPS[i]) * f;
        // Big spools are heavy: the fan lags the HP spool.
        s.w[i] += (w - s.w[i]) * ease(1.6 - i * 0.35);
        s.a[i] += DIR[i] * s.w[i] * Math.PI * 2 * dt;
      }
      const frac = clamp01((s.thrust - IDLE_KN) / (MAX_KN - IDLE_KN));
      s.flow += dt * (25 + frac * 320);
      s.t += dt;
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView, paint, setFull]);

  /* ---- render ---- */

  const status = statusFor(shownCount);
  const realStatus = statusFor(realCount);
  const toneFor = (spool: number, tone: Tone) => (isLit(spool) ? LIT : tone);
  const nozzleTone = exhaustLit ? LIT : TONES.bright;

  return (
    <div className={`w-full max-w-[760px] font-plex ${className}`} onPointerDownCapture={() => setTouched(true)}>
      <div
        ref={wrapperRef}
        tabIndex={0}
        role="group"
        aria-roledescription="interactive diagram"
        aria-label="Turbofan ground run. Drag sideways or use the left and right arrows to preview throttle; Space plays a take-off run. The buttons below save which bars your project clears."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="cursor-ew-resize touch-pan-y select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
      >
        <svg viewBox="0 0 780 380" role="img" aria-label={ARIA_LABEL} className="block h-auto w-full">
          <defs>
            <linearGradient id="tf-plume" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={LIME} stopOpacity={0.85} />
              <stop offset="0.55" stopColor={LIME} stopOpacity={0.3} />
              <stop offset="1" stopColor={LIME} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="tf-glow" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#b8d93f" stopOpacity={0.35} />
              <stop offset="1" stopColor="#86a324" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* ---- ground-run thrust frame (furthest back) ---- */}
          <Block x={8} y={364} w={760} h={10} d={6} tone={TONES.plate} />
          {[20, 748].map((x) => (
            <Block key={x} x={x} y={20} w={12} h={344} d={5} tone={TONES.base} />
          ))}
          <Block x={14} y={10} w={752} h={10} d={6} tone={TONES.raised} />
          {/* flexures the floating carriage hangs from */}
          {[512, 612].map((x) => (
            <Block key={x} x={x} y={20} w={5} h={20} d={3} tone={TONES.base} />
          ))}
          {/* pylon down to the core */}
          <polygon
            points={pts([
              [510, 50],
              [630, 50],
              [600, CY - 42],
              [450, CY - 56],
            ])}
            fill={TONES.base.left}
            stroke="#000"
            strokeLinejoin="round"
          />
          <polyline
            points={pts([
              [510, 51],
              [450, CY - 56],
            ])}
            fill="none"
            stroke={TONES.raised.left}
            strokeWidth={2}
          />
          {/* floating carriage */}
          <Block x={490} y={40} w={150} h={10} d={5} tone={TONES.raised} />
          {/* load cell: link rod from the carriage, cell bolted to the rear leg */}
          <line x1={645} y1={48} x2={662} y2={48} stroke="#5a5a5a" strokeWidth={3} />
          <circle cx={648} cy={48} r={3} fill="#2a2a2a" stroke="#8a8a8a" strokeWidth={1} />
          <circle cx={659} cy={48} r={3} fill="#2a2a2a" stroke="#8a8a8a" strokeWidth={1} />
          <Block x={738} y={38} w={10} h={18} d={3} tone={TONES.base} />
          <Block x={662} y={32} w={76} h={34} d={6} tone={TONES.raised} />
          <rect x={668} y={38} width={64} height={22} fill="#0b0b0b" stroke="#000" />
          <text ref={cellTextRef} x={710} y={55.5} textAnchor="end" className="font-dots" fontSize={17} fill={LIME}>
            {INITIAL_KN}
          </text>
          <text x={713} y={55.5} className="font-pixel" fontSize={8} fill="#7e7e7e">
            kN
          </text>

          {/* ---- engine interior: far walls of the cut ---- */}
          <polygon points={pts([...up(NAC_IN), [420, CY], [80, CY]])} fill="#0f0f0f" />
          <polygon points={pts([...up(CORE_IN), [600, CY], [184, CY]])} fill="#141414" />

          {/* airflow streaks (speed with thrust) */}
          <g ref={streaksRef} opacity={0.3} fill="none" stroke="#5a5a5a" strokeWidth={1.2} strokeDasharray="6 16">
            {STREAKS.map((p, i) => (
              <polyline key={i} points={pts(p)} />
            ))}
          </g>

          {/* tail plug */}
          <polygon
            points={pts([
              [546, CY - 22],
              [566, CY - 22],
              [652, CY],
              [566, CY + 22],
              [546, CY + 22],
            ])}
            fill={TONES.base.left}
            stroke="#000"
            strokeLinejoin="round"
          />
          <polyline
            points={pts([
              [566, CY - 21],
              [650, CY - 1],
            ])}
            stroke={TONES.raised.left}
            strokeWidth={1.5}
            fill="none"
          />

          {/* shafts, one per spool */}
          {SHAFTS.map((sh) => {
            const t = toneFor(sh.spool, TONES.raised);
            return (
              <g key={sh.spool}>
                <rect
                  x={sh.x0}
                  y={CY - sh.r}
                  width={sh.x1 - sh.x0}
                  height={sh.r * 2}
                  stroke="#000"
                  style={{ fill: t.right, transition: FILL_TRANSITION }}
                />
                <line
                  x1={sh.x0}
                  y1={CY - sh.r + 1}
                  x2={sh.x1}
                  y2={CY - sh.r + 1}
                  strokeWidth={1.5}
                  style={{ stroke: t.top, transition: FILL_TRANSITION }}
                />
              </g>
            );
          })}

          {/* combustor (spool 3's hot section): annular liner, injector, dilution holes */}
          {(() => {
            const t = toneFor(2, TONES.base);
            return (
              <g>
                <rect x={330} y={CY - 31} width={8} height={5} stroke="#000" style={{ fill: t.top }} />
                <rect
                  x={338}
                  y={CY - 35}
                  width={48}
                  height={14}
                  stroke="#000"
                  style={{ fill: t.left, transition: FILL_TRANSITION }}
                />
                <line
                  x1={338}
                  y1={CY - 34}
                  x2={386}
                  y2={CY - 34}
                  strokeWidth={2}
                  style={{ stroke: t.top, transition: FILL_TRANSITION }}
                />
                {[348, 360, 372].map((x) => (
                  <circle
                    key={x}
                    cx={x}
                    cy={CY - 27}
                    r={2}
                    style={{ fill: isLit(2) ? LIME_DEEP : "#0b0b0b", transition: FILL_TRANSITION }}
                  />
                ))}
              </g>
            );
          })()}

          {/* spinner */}
          <path
            d={`M104,${CY} Q108,${CY - 18} 150,${CY - 22} L150,${CY + 22} Q108,${CY + 18} 104,${CY} Z`}
            stroke="#000"
            style={{ fill: isLit(0) ? LIT.left : TONES.raised.left, transition: FILL_TRANSITION }}
          />

          {/* blade discs: rim + hub, blades painted imperatively */}
          {DISCS.map((d, di) => {
            const on = isLit(d.spool);
            return (
              <g key={d.x}>
                <ellipse
                  cx={d.x}
                  cy={CY}
                  rx={r2(d.R * EX)}
                  ry={d.R}
                  fill="none"
                  strokeWidth={1}
                  style={{ stroke: on ? "#86a324" : "#2a2a2a", transition: FILL_TRANSITION }}
                />
                <g
                  ref={(el) => {
                    discRefs.current[di] = el;
                  }}
                  strokeWidth={d.w}
                  strokeLinecap="round"
                >
                  {Array.from({ length: d.n }, (_, k) => (
                    <line key={k} />
                  ))}
                </g>
                <ellipse
                  cx={d.x}
                  cy={CY}
                  rx={r2(d.hub * EX)}
                  ry={d.hub}
                  stroke="#000"
                  style={{ fill: on ? LIT.right : TONES.raised.right, transition: FILL_TRANSITION }}
                />
              </g>
            );
          })}

          {/* exhaust plume: the lime part at take-off thrust */}
          <g ref={plumeRef} opacity={0}>
            <path
              d={`M${NOZZLE_X1},${CY - 44} C650,${CY - 50} 700,${CY - 40} 772,${CY - 26} L772,${CY + 26} C700,${CY + 40} 650,${CY + 50} ${NOZZLE_X1},${CY + 44} Z`}
              fill="url(#tf-glow)"
            />
            <path
              d={`M${NOZZLE_X1},${CY - 36} C640,${CY - 34} 700,${CY - 22} 770,${CY - 10} L770,${CY + 10} C700,${CY + 22} 640,${CY + 34} ${NOZZLE_X1},${CY + 36} Z`}
              fill="url(#tf-plume)"
            />
          </g>

          {/* ---- cut faces (upper) ---- */}
          <polygon points={band(NAC_IN, NAC_OUT)} stroke="#000" strokeLinejoin="round" fill={TONES.raised.left} />
          <polyline points={pts(up(NAC_OUT))} fill="none" stroke={TONES.raised.top} strokeWidth={3} />
          {[180, 260, 340].map((x) => (
            <line key={x} x1={x} y1={CY - 90} x2={x} y2={CY - 100} stroke="#2a2a2a" strokeWidth={1} />
          ))}
          <polygon points={band(CORE_IN, CORE_OUT)} stroke="#000" strokeLinejoin="round" fill={TONES.base.left} />
          <polyline points={pts(up(CORE_OUT))} fill="none" stroke={TONES.raised.left} strokeWidth={2} />

          {/* ---- exterior skins (lower half) ---- */}
          <polygon
            points={lowerSkin(CORE_OUT.filter(([x]) => x >= 420), 0, 1)}
            stroke="#000"
            strokeLinejoin="round"
            fill={TONES.raised.right}
          />
          <polygon points={lowerSkin(CORE_OUT.filter(([x]) => x >= 420), 0.68, 1)} fill={TONES.base.right} />
          <polygon points={lowerSkin(NAC_OUT, 0, 1)} stroke="#000" strokeLinejoin="round" fill={TONES.raised.left} />
          <polygon points={lowerSkin(NAC_OUT, 0.66, 1)} fill={TONES.raised.right} />
          <polyline
            points={pts(NAC_OUT.map(([x, r]) => [x, CY + r * 0.22] as const))}
            fill="none"
            stroke={TONES.raised.top}
            strokeWidth={1.5}
          />
          {[160, 300].map((x) => (
            <line key={x} x1={x} y1={CY + 4} x2={x} y2={CY + 96} stroke="#2a2a2a" strokeWidth={1} />
          ))}
          <polyline points={pts(down(NAC_OUT))} fill="none" stroke="#000" strokeWidth={1} />
          {/* intake lip */}
          <polygon
            points={pts([
              [76, CY - 92],
              [84, CY - 96],
              [84, CY + 96],
              [76, CY + 92],
            ])}
            stroke="#000"
            strokeLinejoin="round"
            fill={TONES.bright.left}
          />
          <line x1={80} y1={CY} x2={600} y2={CY} stroke="#000" strokeWidth={1} />

          {/* core nozzle lip: upper cut band and lower skin */}
          <polygon
            points={pts([
              [NOZZLE_X0, CY - 38],
              [NOZZLE_X0, CY - 44],
              [NOZZLE_X1, CY - 42],
              [NOZZLE_X1, CY - 36],
            ])}
            stroke="#000"
            style={{ fill: nozzleTone.top, transition: FILL_TRANSITION }}
          />
          <polygon
            points={pts([
              [NOZZLE_X0, CY],
              [NOZZLE_X0, CY + 44],
              [NOZZLE_X1, CY + 42],
              [NOZZLE_X1, CY],
            ])}
            stroke="#000"
            style={{ fill: nozzleTone.right, transition: FILL_TRANSITION }}
          />

          {/* labels: overlay, never occluded */}
          {SPOOLS.map((_, i) => (
            <SpoolLabel key={i} i={i} lit={isLit(i)} cleared={shown[i]} />
          ))}
          <Label x={700} y={346} tickTo={CY + 40} lit={exhaustLit}>
            Exhaust
          </Label>
          <Label x={700} y={86} lit={false}>
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
                  Bars {shownCount}/{BARS.length}
                </span>
                <span aria-hidden="true" className="font-pixel text-[9px] uppercase tracking-[0.25em] text-lightgray">
                  {previewing ? (
                    <>
                      Preview <span ref={pctRef}>0%</span>
                    </>
                  ) : demo ? (
                    "Demo"
                  ) : (
                    "Live"
                  )}
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
                    shownCount === BARS.length ? "text-lime" : "text-bright"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
          </div>
          {/* Screen readers hear the user's real state, never the demo tour or a preview. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {loaded ? `${realStatus}. ${thrustFor(realCount)} kilonewtons. Bars ${realCount} of ${BARS.length}.` : ""}
          </p>
        </div>
      </div>

      {/* Self-check: which bars does your project clear? */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {BARS.map((bar, i) => {
          const on = bars[i];
          return (
            <button
              key={bar.title}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(i)}
              className={`flex flex-col items-start gap-2 border border-dashed p-3 text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
                on ? "border-lime bg-lime-deep" : "border-hairline hover:border-lightgray"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block size-2.5 border ${on ? "border-lime bg-lime" : "border-lightgray"}`}
                />
                <span
                  className={`font-pixel text-[9px] uppercase tracking-[0.25em] ${on ? "text-lime" : "text-lightgray"}`}
                >
                  Spool {i + 1} · {SPOOLS[i].name}
                </span>
              </span>
              <span
                className={`font-pixel text-[11px] uppercase leading-snug tracking-[0.15em] ${
                  on ? "text-lime" : "text-bright"
                }`}
              >
                {bar.title}
              </span>
              <span className="text-xs leading-relaxed text-lightgray">{bar.body}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
