// Halftone renderer for the hero hands, ported from gradium.ai/phonon.
// Turns a grayscale source into a square grid of uniform dots whose
// opacity is quantised into a few shade levels.

export type Crop = { x: number; y: number; w: number; h: number };
export type InkLayer = { a: number; path: Path2D };
export type Dot = { x: number; y: number; t: number };

export const DESIGN = {
  width: 3620,
  cell: 8,
  scale: 0.81,
  brightness: 1,
  contrast: -0.82,
  gamma: 2.61,
  blackPoint: 0.76,
  whitePoint: 0.94,
  shadeLevels: 7,
  shadeMin: 0.24,
};

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** Tone-curve settings; the defaults suit the hero hands' pre-processed source. */
export type Tone = Pick<typeof DESIGN, "blackPoint" | "whitePoint" | "brightness" | "contrast" | "gamma">;

function tone(v: number, curve: Tone) {
  const { blackPoint: bp, whitePoint: wp, brightness: m, contrast: p, gamma } = curve;
  const k = p >= 0 ? 1 / (1 - 0.98 * p) : 1 + p;
  let t = (v - bp) / (wp - bp);
  t = (t + m - 0.5) * k + 0.5;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.pow(t, 1 / gamma);
}

function shade(t: number) {
  const n = DESIGN.shadeLevels;
  const level = Math.min(n - 1, Math.floor(Math.max(0, t) * n));
  const min = DESIGN.shadeMin;
  return Math.round((min + ((1 - min) * level) / (n - 1)) * 1000) / 1000;
}

/** Halftone `img` on a square grid; `width` sets the design-space width (and so the dot count). */
export function computeDots(img: HTMLImageElement, width = DESIGN.width, curve: Tone = DESIGN) {
  const W = width;
  const H = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const cell = DESIGN.cell;
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);

  // Downscale the source to one pixel per cell; the browser box-filters it.
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, cols, rows);
  const px = ctx.getImageData(0, 0, cols, rows).data;

  const dots: Dot[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const o = (j * cols + i) * 4;
      const lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
      const t = tone(lum, curve);
      if (t < 0.04) continue;
      dots.push({ x: (i + 0.5) * cell, y: (j + 0.5) * cell, t });
    }
  }
  return { W, H, dots };
}

// Square "pixels" rather than round dots, for a terminal look.
export function inkLayers(dots: Dot[]): InkLayer[] {
  const side = DESIGN.cell * DESIGN.scale * 0.85;
  const groups = new Map<number, Path2D>();
  for (const d of dots) {
    const a = shade(d.t);
    let p = groups.get(a);
    if (!p) groups.set(a, (p = new Path2D()));
    p.rect(d.x - side / 2, d.y - side / 2, side, side);
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([a, path]) => ({ a, path }));
}

// Split the dots into the two hands at the widest empty column band in the
// middle third, then crop each hand to the 1st–99th percentile of its rows.
export function handCrops({ W, H, dots }: { W: number; H: number; dots: Dot[] }) {
  const bin = 20;
  const hist = new Uint32Array(Math.ceil(W / bin));
  for (const d of dots) hist[Math.min(hist.length - 1, Math.floor(d.x / bin))]++;
  const peak = Math.max(...hist);
  let gap = [Math.floor(hist.length / 2), Math.floor(hist.length / 2)];
  for (let i = Math.floor(hist.length / 3); i < (2 * hist.length) / 3; i++) {
    if (hist[i] > 0.03 * peak) continue;
    let k = i;
    while (k < hist.length && hist[k] <= 0.03 * peak) k++;
    if (k - i > gap[1] - gap[0]) gap = [i, k];
    i = k;
  }
  const mid = ((gap[0] + gap[1]) / 2) * bin;
  const crop = (side: "left" | "right"): Crop => {
    const ys = dots
      .filter((d) => (side === "left" ? d.x < mid : d.x >= mid))
      .map((d) => d.y)
      .sort((a, b) => a - b);
    const y0 = Math.max(0, ys[Math.floor(0.01 * ys.length)] - 40);
    const y1 = Math.min(H, ys[Math.floor(0.99 * ys.length)] + 40);
    const x0 = side === "left" ? 0 : Math.max(0, gap[1] * bin - 60);
    const x1 = side === "left" ? Math.min(W, gap[0] * bin + 60) : W;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  return { left: crop("left"), right: crop("right") };
}

// Dark → mid → light stops for the lime duotone shown under the hover lens.
const TINT = ["#1f2606", "#86a324", "#daff52"].map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});
const TINT_GAMMA = 1.35;

function tint(t: number) {
  const [lo, hi] = t < 0.5 ? [TINT[0], TINT[1]] : [TINT[1], TINT[2]];
  const k = t < 0.5 ? 2 * t : (t - 0.5) * 2;
  return [0, 1, 2].map((i) => lo[i] + (hi[i] - lo[i]) * k);
}

/** Recolour a canvas in place as a lime duotone: auto-levels on luminance, gamma, then map to TINT. */
export function tintToLime(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  const lum = new Float32Array(px.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) {
    const l = (0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2]) / 255;
    lum[i] = l;
    if (px[4 * i + 3] > 0) hist[Math.min(255, Math.round(255 * l))]++;
  }
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const pct = (q: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= q * total) return i / 255;
    return 1;
  };
  const lo = pct(0.02);
  const hi = Math.max(lo + 0.05, pct(0.995));
  for (let i = 0; i < lum.length; i++) {
    const t = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))), TINT_GAMMA);
    const [r, g, b] = tint(t);
    px[4 * i] = r;
    px[4 * i + 1] = g;
    px[4 * i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}
