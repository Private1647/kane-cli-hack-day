// Hover lens shared by the halftone hands and the wordmark: a square window
// that eases open under the pointer, trails it smoothly, and shows an
// alternate rendering of whatever it is over.

/** Lens half-size in CSS px; also how far lens canvases spill past their box. */
export const LENS = 65;
export const RING = "#daff52";
export const LENS_MEDIA = "(min-width: 64rem) and (hover: hover) and (pointer: fine)";

const MASK_CELL = 8; // CSS px per hit-mask cell

export type HitMask = { cells: Uint8Array; cols: number; rows: number };

/**
 * Coarse grid of where `source` has ink, dilated by two cells, so the lens
 * only opens when the pointer is on (or right next to) the artwork.
 */
export function buildHitMask(source: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): HitMask {
  const cols = Math.ceil(cssW / MASK_CELL);
  const rows = Math.ceil(cssH / MASK_CELL);
  const raw = new Uint8Array(cols * rows);
  const w = source.width;
  const h = source.height;
  const px = source.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const block = MASK_CELL * dpr;
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor(y / block)) * cols;
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 8) raw[row + Math.min(cols - 1, Math.floor(x / block))] = 1;
  }
  const cells = new Uint8Array(raw.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!raw[y * cols + x]) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) cells[ny * cols + nx] = 1;
        }
    }
  return { cells, cols, rows };
}

export function hits(mask: HitMask | null, x: number, y: number) {
  if (!mask) return false;
  const cx = Math.floor(x / MASK_CELL);
  const cy = Math.floor(y / MASK_CELL);
  return cx >= 0 && cy >= 0 && cx < mask.cols && cy < mask.rows && !!mask.cells[cy * mask.cols + cx];
}

/** Draw the lens window (filled by `content`) plus its frame, ticks and readout. */
export function drawLens(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  mono: string,
  content: () => void,
  /** Colour the lens clears to before `content`; match the page behind it. */
  paper = "#000",
) {
  if (open <= 0.001) return;
  const r = LENS * open;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - r, y - r, 2 * r, 2 * r);
  ctx.clip();
  ctx.fillStyle = paper;
  ctx.fill();
  content();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = open;
  ctx.strokeStyle = RING;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - r - 4.5, y - r - 4.5, 2 * r + 9, 2 * r + 9);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * (r + 4), y + dy * (r + 4));
    ctx.lineTo(x + dx * (r + 14), y + dy * (r + 14));
  }
  ctx.stroke();
  ctx.fillStyle = RING;
  ctx.font = `11px ${mono}`;
  ctx.fillText(
    `x:${String(Math.round(x)).padStart(4, "0")} y:${String(Math.round(y)).padStart(4, "0")}`,
    x - r - 4,
    y + r + 20,
  );
  ctx.restore();
}

/**
 * Wire pointer events on `el` to an eased lens. `isOver` decides whether
 * the pointer (in `el`-relative CSS px) should open it; `paint` redraws
 * each frame.
 */
export function attachLens(
  el: HTMLElement,
  isOver: (x: number, y: number) => boolean,
  paint: (x: number, y: number, open: number) => void,
) {
  const target = { x: 0, y: 0 };
  const lens = { x: 0, y: 0 };
  let hovering = false;
  let open = 0;
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const goal = hovering ? 1 : 0;
    open += (goal - open) * (1 - Math.exp(-dt * (goal > open ? 13 : 11)));
    if (Math.abs(goal - open) < 0.002) open = goal;
    const follow = 1 - Math.exp(-16 * dt);
    lens.x += (target.x - lens.x) * follow;
    lens.y += (target.y - lens.y) * follow;
    paint(lens.x, lens.y, open);
    if (hovering || open > 0) raf = requestAnimationFrame(tick);
    else raf = last = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const rect = el.getBoundingClientRect();
    target.x = e.clientX - rect.left;
    target.y = e.clientY - rect.top;
    const over = isOver(target.x, target.y);
    // Open the lens where the pointer is rather than sliding in from the last spot.
    if (over && !hovering && open < 0.01) {
      lens.x = target.x;
      lens.y = target.y;
    }
    hovering = over;
    kick();
  };
  const onLeave = () => {
    hovering = false;
    kick();
  };
  el.addEventListener("pointerenter", onMove);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);

  return {
    /** Repaint at the current lens state, e.g. after a resize. */
    repaint: () => paint(lens.x, lens.y, open),
    dispose: () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", onMove);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    },
  };
}
