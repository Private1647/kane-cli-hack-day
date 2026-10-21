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

/* ------------------------------------------------------------------------ */
/* Copy                                                                      */
/* ------------------------------------------------------------------------ */

const STEPS = [
  { label: "Agent writes", caption: "Your OpenAI agent ships a code change to your app." },
  {
    label: "Kane runs",
    caption:
      "The change triggers Kane CLI. It turns your requirements into tests and drives the real flows in a browser.",
  },
  {
    label: "Evidence pack",
    caption: "Every run seals a .evidence pack: traceability, proven coverage, and root cause, pass or fail.",
  },
  {
    label: "Agent fixes",
    caption: "Root-cause analysis hands your agent a fix prompt. It fixes, Kane reruns.",
  },
] as const;

/** What travels along each leg of the track (leg k runs station k -> k+1). */
const LEG_LABELS = ["code change", "triggers a run", "sealed run", "fix prompt"] as const;

const TAGLINE = "Nothing ships on the agent’s word alone.";

const ARIA_LABEL =
  "Isometric diagram of the Kane CLI assurance loop, from requirement to proof. Your OpenAI agent ships " +
  "a code change to your app. The change triggers Kane CLI, which turns your requirement documents " +
  "(PRDs and specs) into tests and drives the real flows of your app in a browser. Every run seals a " +
  ".evidence pack, pass or fail, with traceability, proven coverage and root cause analysis. The root " +
  "cause analysis hands a fix prompt back to the agent, which fixes the code so Kane reruns.";

/* ------------------------------------------------------------------------ */
/* Timing                                                                    */
/* ------------------------------------------------------------------------ */

const STEP_MS = 2400;
/** Share of each step spent travelling; the rest is a dwell with the packet parked inside the station. */
const TRAVEL = 0.8;
/** One trip of Kane's "driving" dots along the pointer to the app. */
const DOT_MS = 900;
const FILL_TRANSITION = "fill 250ms ease, stroke 250ms ease";

/* ------------------------------------------------------------------------ */
/* Isometric projection                                                      */
/* ------------------------------------------------------------------------ */

/** Pixels per world unit. */
const S = 40;
const COS30 = Math.cos(Math.PI / 6);

/**
 * World (x, y, z) -> screen (sx, sy). World x runs down-right, y runs
 * down-left, z is up. Because the projection is linear, a world-space
 * translation is a plain screen-space translate, which the packet relies on.
 */
// Rounded to 0.01px so server and browser render identical SVG attributes
// (float noise in trig would otherwise cause hydration mismatches).
const r2 = (v: number) => Math.round(v * 100) / 100;

function iso(x: number, y: number, z = 0): [number, number] {
  return [r2((x - y) * COS30 * S), r2(((x + y) * 0.5 - z) * S)];
}

type P3 = readonly [number, number, number];

function pts(points: readonly P3[]): string {
  return points
    .map((p) => {
      const [sx, sy] = iso(p[0], p[1], p[2]);
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Matrix that lays local text onto a face lying in an x/z plane (the
 * left-facing "+y" face): local +x follows world +x on screen, local +y
 * follows world -z (straight down).
 */
const C4 = COS30.toFixed(4);

function onLeftFace(x: number, y: number, z: number): string {
  const [sx, sy] = iso(x, y, z);
  return `matrix(${C4} 0.5 0 1 ${sx.toFixed(2)} ${sy.toFixed(2)})`;
}

/**
 * Matrices that lay text flat on the floor (z = 0), so leg labels read like
 * paint on the track. "alongX": text runs toward world +x (screen down-right)
 * with glyph tops toward -y. "alongNegY": text runs toward world -y (screen
 * up-right) with glyph tops toward -x. Both keep the glyphs upright on screen.
 */
function onFloor(x: number, y: number, run: "alongX" | "alongNegY"): string {
  const [sx, sy] = iso(x, y, 0);
  return run === "alongX"
    ? `matrix(${C4} 0.5 -${C4} 0.5 ${sx.toFixed(2)} ${sy.toFixed(2)})`
    : `matrix(${C4} -0.5 ${C4} 0.5 ${sx.toFixed(2)} ${sy.toFixed(2)})`;
}

/* ------------------------------------------------------------------------ */
/* Palette                                                                   */
/* ------------------------------------------------------------------------ */

type Tone = { top: string; left: string; right: string };

const TONES = {
  plate: { top: "#121212", left: "#0d0d0d", right: "#080808" },
  base: { top: "#3a3a3a", left: "#2a2a2a", right: "#1a1a1a" },
  raised: { top: "#5a5a5a", left: "#3a3a3a", right: "#2a2a2a" },
  bright: { top: "#8a8a8a", left: "#5a5a5a", right: "#3a3a3a" },
} satisfies Record<string, Tone>;

const LIT: Tone = { top: "#daff52", left: "#b8d93f", right: "#86a324" };
const LIME = "#daff52";
const LIME_DEEP = "#1f2606";

/** Ink used for details drawn on top of a part (screens, lines, tape). */
function detail(lit: boolean) {
  return {
    well: lit ? LIME_DEEP : "#0b0b0b",
    line: lit ? LIME : "#8a8a8a",
    mark: lit ? LIME_DEEP : "#8a8a8a",
  };
}

/* ------------------------------------------------------------------------ */
/* Primitives                                                                */
/* ------------------------------------------------------------------------ */

function Face({ points, fill }: { points: readonly P3[]; fill: string }) {
  return (
    <polygon
      points={pts(points)}
      stroke="#000"
      strokeWidth={1}
      strokeLinejoin="round"
      style={{ fill, transition: FILL_TRANSITION }}
    />
  );
}

/**
 * Solid box with its min corner at (x, y, z). Only the three faces that can
 * face the viewer are drawn: top, the +y face (lower left) and the +x face
 * (lower right), shaded light / mid / dark.
 */
function Box({
  x,
  y,
  z,
  w,
  d,
  h,
  tone,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tone: Tone;
}) {
  const X = x + w;
  const Y = y + d;
  const Z = z + h;
  return (
    <g>
      <Face points={[[X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]]} fill={tone.right} />
      <Face points={[[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]]} fill={tone.left} />
      <Face points={[[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]]} fill={tone.top} />
    </g>
  );
}

/** Line segment between two world points (for screen text, vents, etc.). */
function Seg({ a, b, stroke, width = 2 }: { a: P3; b: P3; stroke: string; width?: number }) {
  const [x1, y1] = iso(a[0], a[1], a[2]);
  const [x2, y2] = iso(b[0], b[1], b[2]);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      strokeWidth={width}
      strokeLinecap="square"
      style={{ stroke, transition: FILL_TRANSITION }}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Parts. Each sits on a 2x2 footprint centred on its station; sub-pieces    */
/* are listed back-to-front so they paint correctly.                         */
/* ------------------------------------------------------------------------ */

function AgentPart({ lit }: { lit: boolean }) {
  const t = lit ? LIT : TONES.base;
  const r = lit ? LIT : TONES.raised;
  const ink = detail(lit);
  const fy = 6.37; // front plane of the monitor
  return (
    <g>
      <Box x={0} y={6} z={0} w={2} d={2} h={0.7} tone={t} />
      {/* monitor */}
      <Box x={0.25} y={6.15} z={0.7} w={1.5} d={0.22} h={1.15} tone={r} />
      <Face points={[[0.37, fy, 0.82], [1.63, fy, 0.82], [1.63, fy, 1.74], [0.37, fy, 1.74]]} fill={ink.well} />
      {/* prompt: ">" then a few lines of code, then a caret */}
      <Seg a={[0.48, fy, 1.6]} b={[0.56, fy, 1.54]} stroke={ink.line} />
      <Seg a={[0.56, fy, 1.54]} b={[0.48, fy, 1.48]} stroke={ink.line} />
      <Seg a={[0.66, fy, 1.54]} b={[1.4, fy, 1.54]} stroke={ink.line} />
      <Seg a={[0.66, fy, 1.36]} b={[1.2, fy, 1.36]} stroke={ink.line} />
      <Seg a={[0.66, fy, 1.18]} b={[1.48, fy, 1.18]} stroke={ink.line} />
      <Seg a={[0.66, fy, 1.0]} b={[0.8, fy, 1.0]} stroke={ink.line} width={4} />
      {/* keyboard */}
      <Box x={0.35} y={6.95} z={0.7} w={1.3} d={0.55} h={0.08} tone={r} />
    </g>
  );
}

function AppPart() {
  const z = 0.55;
  return (
    <g>
      <Box x={0.2} y={0.2} z={0} w={1.6} d={1.6} h={z} tone={TONES.base} />
      {/* a tiny UI painted on the lid: header bar and two cards */}
      <Face points={[[0.35, 0.35, z], [1.65, 0.35, z], [1.65, 0.62, z], [0.35, 0.62, z]]} fill="#5a5a5a" />
      <Face points={[[0.35, 0.8, z], [0.92, 0.8, z], [0.92, 1.65, z], [0.35, 1.65, z]]} fill="#2a2a2a" />
      <Face points={[[1.08, 0.8, z], [1.65, 0.8, z], [1.65, 1.65, z], [1.08, 1.65, z]]} fill="#2a2a2a" />
    </g>
  );
}

function KanePart({ lit }: { lit: boolean }) {
  const t = lit ? LIT : TONES.base;
  const r = lit ? LIT : TONES.raised;
  const ink = detail(lit);
  const fy = 0.38; // front plane of the browser window
  return (
    <g>
      <Box x={6} y={0} z={0} w={2} d={2} h={0.9} tone={t} />
      {/* vents on the right face */}
      <Seg a={[8, 0.35, 0.3]} b={[8, 1.65, 0.3]} stroke={ink.mark} width={1.5} />
      <Seg a={[8, 0.35, 0.45]} b={[8, 1.65, 0.45]} stroke={ink.mark} width={1.5} />
      <Seg a={[8, 0.35, 0.6]} b={[8, 1.65, 0.6]} stroke={ink.mark} width={1.5} />
      {/* browser window */}
      <Box x={6.2} y={0.2} z={0.9} w={1.6} d={0.18} h={1.2} tone={r} />
      <Face points={[[6.3, fy, 1.0], [7.7, fy, 1.0], [7.7, fy, 1.88], [6.3, fy, 1.88]]} fill={ink.well} />
      {[6.4, 6.52, 6.64].map((x) => {
        const [cx, cy] = iso(x, fy, 1.98);
        return <circle key={x} cx={cx} cy={cy} r={2.2} style={{ fill: ink.mark, transition: FILL_TRANSITION }} />;
      })}
      {/* page content: hero block, copy lines, a button */}
      <Face points={[[6.42, fy, 1.5], [7.58, fy, 1.5], [7.58, fy, 1.78], [6.42, fy, 1.78]]} fill={lit ? "#3a4a0c" : "#2a2a2a"} />
      <Seg a={[6.42, fy, 1.38]} b={[7.3, fy, 1.38]} stroke={ink.line} />
      <Seg a={[6.42, fy, 1.26]} b={[7.0, fy, 1.26]} stroke={ink.line} />
      <Face points={[[6.42, fy, 1.06], [6.9, fy, 1.06], [6.9, fy, 1.16], [6.42, fy, 1.16]]} fill={ink.line} />
    </g>
  );
}

function EvidencePart({ lit }: { lit: boolean }) {
  const t = lit ? LIT : TONES.base;
  const r = lit ? LIT : TONES.raised;
  const ink = detail(lit);
  const lidZ = 1.3;
  return (
    <g>
      <Box x={6.1} y={6.1} z={0} w={1.8} d={1.8} h={1.15} tone={t} />
      {/* seal tape running down the right face */}
      <Face points={[[7.9, 6.85, 0], [7.9, 7.15, 0], [7.9, 7.15, 1.15], [7.9, 6.85, 1.15]]} fill={ink.mark} />
      {/* lid overhangs slightly */}
      <Box x={6.05} y={6.05} z={1.15} w={1.9} d={1.9} h={0.15} tone={r} />
      <Face
        points={[[6.05, 6.85, lidZ], [7.95, 6.85, lidZ], [7.95, 7.15, lidZ], [6.05, 7.15, lidZ]]}
        fill={ink.mark}
      />
      {/* stencilled label on the left face */}
      <text
        transform={onLeftFace(6.25, 7.9, 0.4)}
        className="font-pixel"
        fontSize={11}
        textLength={60}
        lengthAdjust="spacingAndGlyphs"
        style={{ fill: lit ? LIME_DEEP : "#8a8a8a", transition: FILL_TRANSITION }}
      >
        .evidence
      </text>
    </g>
  );
}

/**
 * Requirement documents (PRDs / specs) on their own pad just outside the
 * track, in front of Kane. Kane designs its tests from these, so a short feed
 * arrow runs from the stack into Kane. Always greyscale: it is an input, not
 * the part to watch.
 */
const SHEETS = [
  { dx: 0.04, dy: 0.02 },
  { dx: -0.04, dy: 0.06 },
  { dx: 0.02, dy: -0.02 },
] as const;

function RequirementsPart() {
  const paper: Tone = { top: "#8a8a8a", left: "#5a5a5a", right: "#3a3a3a" };
  const topZ = (SHEETS.length - 1) * 0.09 + 0.05;
  const top = SHEETS[SHEETS.length - 1];
  const x0 = 8.9 + top.dx;
  const y0 = 2.5 + top.dy;
  return (
    <g>
      <Box x={8.7} y={2.35} z={-0.3} w={1.4} d={1.5} h={0.3} tone={TONES.plate} />
      {SHEETS.map((s, i) => (
        <Box key={i} x={8.9 + s.dx} y={2.5 + s.dy} z={i * 0.09} w={0.95} d={1.2} h={0.05} tone={paper} />
      ))}
      {/* header rule and body copy printed on the top sheet */}
      <Seg a={[x0 + 0.12, y0 + 0.16, topZ]} b={[x0 + 0.6, y0 + 0.16, topZ]} stroke="#2a2a2a" width={3} />
      {[0.38, 0.54, 0.7, 0.86, 1.02].map((dy, i) => (
        <Seg
          key={dy}
          a={[x0 + 0.12, y0 + dy, topZ]}
          b={[x0 + (i % 2 ? 0.62 : 0.8), y0 + dy, topZ]}
          stroke="#3a3a3a"
          width={1.5}
        />
      ))}
    </g>
  );
}

/** Dashed feed from the requirements stack into Kane's front corner (world -x,-y is straight up on screen). */
function RequirementsFeed() {
  const a = iso(8.78, 2.43, 0);
  const b = iso(8.1, 1.75, 0);
  return (
    <g stroke="#8a8a8a" fill="none" strokeWidth={1.5}>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1] + 4} strokeDasharray="3 3" />
      <polyline points={`${b[0] - 4},${b[1] + 5} ${b[0]},${b[1]} ${b[0] + 4},${b[1] + 5}`} />
    </g>
  );
}

/** The travelling packet: a cube for code/runs, a flat card for the fix prompt. */
function PacketShape({ card }: { card: boolean }) {
  if (!card) {
    return <Box x={-0.25} y={-0.25} z={0} w={0.5} d={0.5} h={0.5} tone={TONES.bright} />;
  }
  const z = 0.28;
  return (
    <g>
      <Face points={[[-0.3, -0.2, 0], [0.4, -0.2, 0], [0.4, 0.3, 0], [-0.3, 0.3, 0]]} fill="#0b0b0b" />
      <Box x={-0.35} y={-0.25} z={0.2} w={0.7} d={0.5} h={0.08} tone={LIT} />
      <Seg a={[-0.22, -0.1, z]} b={[0.22, -0.1, z]} stroke={LIME_DEEP} width={1.5} />
      <Seg a={[-0.22, 0.04, z]} b={[0.12, 0.04, z]} stroke={LIME_DEEP} width={1.5} />
    </g>
  );
}

/* ------------------------------------------------------------------------ */
/* Track and packet path                                                     */
/* ------------------------------------------------------------------------ */

type V2 = { x: number; y: number };

/** Stations in loop order. `half` is the footprint half-size, so the packet stops at the part's face. */
const STATIONS = [
  { x: 1, y: 7, half: 1 }, // OpenAI agent
  { x: 1, y: 1, half: 0.8 }, // your app
  { x: 7, y: 1, half: 1 }, // Kane CLI
  { x: 7, y: 7, half: 0.9 }, // evidence
] as const;

/** Half the packet's footprint; used to fade it as it crosses a station's wall. */
const PACKET_HALF = 0.3;

/**
 * Segment k runs from the centre of station k to the centre of station k+1
 * along one straight edge of the rectangular track. The packet starts and
 * ends *inside* the parts and is faded out while it is within a footprint, so
 * it never parks glued to a wall: it emerges from one part and disappears
 * into the next.
 */
const SEGMENTS = STATIONS.map((a, i) => {
  const b = STATIONS[(i + 1) % STATIONS.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  // The last leg carries the fix-prompt card, which *is* the lit part in step
  // 4, so it must stay visible: it parks on the centreline in front of the
  // agent's visible +x face instead of disappearing inside it.
  const park = i === STATIONS.length - 1;
  const travel = park ? len - b.half - PACKET_HALF - 0.35 : len;
  return { a, b, len, dir, park, travel, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
});

/** Share of the step at which a parked card starts fading out (handed to the agent). */
const HANDOFF = 0.9;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Sine ease: gentle start/stop without the cubic's 3x mid-leg sprint.
const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

type PacketState = V2 & { opacity: number };

/** Packet position/opacity for a step and the time elapsed within it: ease along the segment, then dwell hidden. */
function packetAt(step: number, elapsed: number): PacketState {
  const { a, b, len, dir, park, travel } = SEGMENTS[step];
  const d = easeInOutSine(clamp01(elapsed / (STEP_MS * TRAVEL))) * travel;
  // Fade in while crossing the start part's wall (over the packet's own
  // width), then either fade out crossing the end part's wall or, when
  // parked, fade out at the very end of the step as it is handed over.
  const out = clamp01((d - a.half + PACKET_HALF) / (2 * PACKET_HALF));
  const into = park
    ? 1 - clamp01((elapsed - STEP_MS * HANDOFF) / (STEP_MS * (1 - HANDOFF)))
    : clamp01((len - d - b.half + PACKET_HALF) / (2 * PACKET_HALF));
  return { x: a.x + dir.x * d, y: a.y + dir.y * d, opacity: Math.min(out, into) };
}

function packetTransform(pos: V2): string {
  const [sx, sy] = iso(pos.x, pos.y, 0);
  return `translate(${sx.toFixed(2)} ${sy.toFixed(2)})`;
}

/**
 * Where each leg's label is painted on the floor: centre point and run
 * direction. Back legs sit inside the ring, front legs outside it, so no
 * label ends up behind a tall part (which would paint over it).
 */
const LEG_TEXT: { x: number; y: number; run: "alongX" | "alongNegY" }[] = [
  { x: 1.85, y: 3.85, run: "alongNegY" }, // agent -> app, inside
  { x: 4.0, y: 1.85, run: "alongX" }, // app -> kane, inside
  { x: 7.85, y: 4.0, run: "alongNegY" }, // kane -> evidence, outside
  { x: 4.0, y: 7.85, run: "alongX" }, // evidence -> agent, outside
];

function Track({ active }: { active: number }) {
  const ring = (lo: number, hi: number) => `M${pts([[lo, lo, 0], [hi, lo, 0], [hi, hi, 0], [lo, hi, 0]])}Z`;
  return (
    <g>
      <path d={ring(0.55, 7.45) + ring(1.45, 6.55)} fillRule="evenodd" fill="#1c1c1c" stroke="#000" />
      <path d={ring(1, 7)} fill="none" stroke="#2f2f2f" strokeWidth={1.5} strokeDasharray="5 7" />
      {SEGMENTS.map((seg, i) => {
        // Two chevrons per leg, either side of the midpoint (clear of the tall
        // parts at the corners), pointing in the direction of travel.
        const { a, dir, len } = seg;
        const perp = { x: -dir.y, y: dir.x };
        const on = i === active;
        return [0.4, 0.6].map((f) => {
          const m = { x: a.x + dir.x * len * f, y: a.y + dir.y * len * f };
          const tip: P3 = [m.x + dir.x * 0.22, m.y + dir.y * 0.22, 0];
          const w1: P3 = [m.x - dir.x * 0.14 + perp.x * 0.28, m.y - dir.y * 0.14 + perp.y * 0.28, 0];
          const w2: P3 = [m.x - dir.x * 0.14 - perp.x * 0.28, m.y - dir.y * 0.14 - perp.y * 0.28, 0];
          return (
            <polyline
              key={`${i}-${f}`}
              points={pts([w1, tip, w2])}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="square"
              style={{ stroke: on ? "#d0d0d0" : "#4a4a4a", transition: FILL_TRANSITION }}
            />
          );
        });
      })}
      {LEG_TEXT.map((t, i) => (
        <text
          key={LEG_LABELS[i]}
          transform={onFloor(t.x, t.y, t.run)}
          textAnchor="middle"
          className="font-pixel uppercase"
          fontSize={10}
          letterSpacing={1.5}
          style={{ fill: i === active ? "#f2f2f2" : "#6a6a6a", transition: FILL_TRANSITION }}
        >
          {LEG_LABELS[i]}
        </text>
      ))}
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
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

/** Kane's pointer: from the left edge of its browser window to the app's right face. */
const BEAM_FROM = iso(6.2, 0.3, 1.45);
const BEAM_TO = iso(1.95, 1, 0.35);
/** "PRD · SPEC" sub-label, one line under the requirements label (below the pad on screen). */
const REQ_SUB = iso(9.4, 3.1, -1.9);

function Label({ at, lit, children }: { at: P3; lit: boolean; children: ReactNode }) {
  const [x, y] = iso(at[0], at[1], at[2]);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="font-pixel uppercase"
      fontSize={14}
      letterSpacing={2.5}
      style={{ fill: lit ? LIME : "#7e7e7e", transition: FILL_TRANSITION }}
    >
      {children}
    </text>
  );
}

export default function AssuranceFigure({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const packetRef = useRef<SVGGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  /** Time spent in the current step; a ref so the RAF loop doesn't re-render every frame. */
  const elapsedRef = useRef(0);

  const active = reduced ? 0 : step;
  const paused = hovered || focused || !inView;

  // Pause while the figure is scrolled out of view.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Drive the packet. Its transform is written straight to the DOM; React only
  // re-renders when the step (and therefore the lit part) changes.
  useLayoutEffect(() => {
    const g = packetRef.current;
    if (!g) return;
    const place = () => {
      const p = packetAt(active, elapsedRef.current);
      g.setAttribute("transform", packetTransform(p));
      g.setAttribute("opacity", p.opacity.toFixed(3));
      // Step 2: dots stream along Kane's pointer into the app, staggered by a
      // third of a trip and faded at both ends.
      const dots = dotsRef.current;
      if (!dots) return;
      Array.from(dots.children).forEach((dot, i) => {
        const t = (elapsedRef.current / DOT_MS + i / dots.children.length) % 1;
        dot.setAttribute("cx", (BEAM_FROM[0] + (BEAM_TO[0] - BEAM_FROM[0]) * t).toFixed(2));
        dot.setAttribute("cy", (BEAM_FROM[1] + (BEAM_TO[1] - BEAM_FROM[1]) * t).toFixed(2));
        dot.setAttribute("opacity", Math.sin(Math.PI * t).toFixed(3));
      });
    };

    if (reduced) {
      elapsedRef.current = STEP_MS * TRAVEL * 0.5; // still frame: packet halfway to the app
      place();
      return;
    }
    place();
    if (paused) return;

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamp the delta so a backgrounded tab doesn't skip straight past a step.
      elapsedRef.current += Math.min(64, now - last);
      last = now;
      if (elapsedRef.current >= STEP_MS) {
        elapsedRef.current = 0;
        setStep((s) => (s + 1) % STEPS.length);
        return; // the effect restarts for the next step
      }
      place();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, paused, reduced]);

  /** Manual jump: show the packet halfway along its leg, so a paused frame reads clearly. */
  const goTo = useCallback((i: number) => {
    elapsedRef.current = STEP_MS * TRAVEL * 0.5;
    setStep(((i % STEPS.length) + STEPS.length) % STEPS.length);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (reduced) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(step - 1);
    }
  };

  /*
   * Painter's order: sort by x + y of each footprint centre (smaller = further
   * back). The packet's depth comes from its segment's midpoint; each segment
   * lies strictly between its two stations in depth, so its slot is fixed for
   * the whole step and never needs re-sorting mid-flight.
   */
  const seg = SEGMENTS[active];
  const scene: { key: string; depth: number; node: ReactNode }[] = [
    { key: "agent", depth: 8, node: <AgentPart lit={active === 0} /> },
    { key: "app", depth: 2, node: <AppPart /> },
    { key: "kane", depth: 8, node: <KanePart lit={active === 1} /> },
    { key: "evidence", depth: 14, node: <EvidencePart lit={active === 2} /> },
    // Pad + sheets sit in front of Kane's +x face; the feed lies on the floor
    // between them, so both paint after Kane.
    { key: "feed", depth: 9.5, node: <RequirementsFeed /> },
    { key: "requirements", depth: 12.5, node: <RequirementsPart /> },
    {
      key: "packet",
      depth: seg.mid.x + seg.mid.y,
      node: (() => {
        const start = packetAt(active, 0);
        return (
          <g ref={packetRef} transform={packetTransform(start)} opacity={start.opacity}>
            <PacketShape card={active === 3} />
          </g>
        );
      })(),
    },
  ];
  scene.sort((a, b) => a.depth - b.depth);

  const [bx1, by1] = BEAM_FROM;
  const [bx2, by2] = BEAM_TO;
  const beamColor = active === 1 ? LIME : "#5a5a5a";

  const current = STEPS[active];

  return (
    <div className={`w-full max-w-[720px] font-plex ${className}`}>
      <div
        ref={wrapperRef}
        tabIndex={0}
        role="group"
        aria-roledescription="interactive diagram"
        aria-label="Assurance loop. Use the left and right arrow keys to step through it."
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        onKeyDown={onKeyDown}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
      >
        <svg viewBox="-320 -50 640 410" role="img" aria-label={ARIA_LABEL} className="block h-auto w-full">
          {/* base plate and track sit under everything */}
          <Box x={-0.4} y={-0.4} z={-0.3} w={8.8} d={8.8} h={0.3} tone={TONES.plate} />
          <Track active={active} />

          {scene.map((item) => (
            <g key={item.key}>{item.node}</g>
          ))}

          {/* overlay: Kane's pointer and the part labels never get occluded */}
          <line
            x1={bx1}
            y1={by1}
            x2={bx2}
            y2={by2}
            strokeWidth={1.5}
            strokeDasharray="4 5"
            style={{ stroke: beamColor, transition: FILL_TRANSITION }}
          />
          <circle cx={bx2} cy={by2} r={3.5} style={{ fill: beamColor, transition: FILL_TRANSITION }} />
          {active === 1 && (
            // Kane exercising the app: positions are written by the RAF loop.
            <g ref={dotsRef} fill={LIME}>
              {[0, 1, 2].map((i) => (
                <circle key={i} cx={bx1} cy={by1} r={3} opacity={0} />
              ))}
            </g>
          )}

          <Label at={[0.6, 5.85, 2.3]} lit={active === 0}>
            OpenAI agent
          </Label>
          <Label at={[0.6, 0.6, 1.2]} lit={false}>
            your app
          </Label>
          <Label at={[6.6, 0.6, 2.75]} lit={active === 1}>
            Kane CLI
          </Label>
          <Label at={[6.4, 6.4, 1.95]} lit={active === 2}>
            .evidence
          </Label>
          <Label at={[9.4, 3.1, -1.55]} lit={false}>
            Requirements
          </Label>
          <text
            x={REQ_SUB[0]}
            y={REQ_SUB[1]}
            textAnchor="middle"
            className="font-pixel uppercase"
            fontSize={10}
            letterSpacing={2}
            fill="#5a5a5a"
          >
            PRD · SPEC
          </text>
        </svg>

        <p className="mt-2 text-center font-pixel text-[10px] uppercase tracking-[0.25em] text-lightgray">
          {TAGLINE}
        </p>

        {reduced ? (
          /* Still frame: every caption at once, nothing moves. */
          <ol className="mt-5 grid gap-3 border border-dashed border-hairline bg-surface p-4 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.label} className="flex gap-3">
                <span className={`font-dots text-2xl leading-none ${i === 0 ? "text-lime" : "text-lightgray"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block font-pixel text-[10px] uppercase tracking-[0.25em] text-bright">
                    {s.label}
                  </span>
                  <span className="mt-1 block text-sm text-lightgray">{s.caption}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {/* Readout. Invisible copies of every caption share one grid cell
                with the live one, so the panel is always as tall as the
                longest caption and never shifts the layout. */}
            <div className="mt-5 grid border border-dashed border-hairline bg-surface p-4">
              {STEPS.map((s) => (
                <div key={s.label} aria-hidden="true" className="invisible col-start-1 row-start-1">
                  <ReadoutBody n={1} label={s.label} caption={s.caption} paused={false} />
                </div>
              ))}
              <div aria-live="polite" aria-atomic="true" className="col-start-1 row-start-1">
                <ReadoutBody n={active + 1} label={current.label} caption={current.caption} paused={paused} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STEPS.map((s, i) => {
                const on = i === active;
                return (
                  <button
                    key={s.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => goTo(i)}
                    className={`border border-dashed px-3 py-2 text-left font-pixel text-[10px] uppercase tracking-[0.25em] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
                      on ? "border-lime bg-lime-deep text-lime" : "border-hairline text-lightgray hover:text-bright"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")} {s.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReadoutBody({
  n,
  label,
  caption,
  paused,
}: {
  n: number;
  label: string;
  caption: string;
  paused: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="font-dots text-5xl leading-none text-lime">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-pixel text-[11px] uppercase tracking-[0.25em] text-bright">{label}</span>
          <span aria-hidden="true" className="font-pixel text-[9px] uppercase tracking-[0.25em] text-lightgray">
            {paused ? "Paused" : "Auto"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-lightgray">{caption}</p>
      </div>
    </div>
  );
}
