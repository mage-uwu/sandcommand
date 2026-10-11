import { CORAL_PALS } from './flora-palette.ts';
import type { Terrain } from '../shared/terrain.ts';
import { openWay } from '../shared/wildlife.ts';

/**
 * The wildlife, drawn in pixels: one terrain cell to a pixel, snapped to the
 * grid like the ground and the alien plants (flora-art.ts), so it sits in
 * the world as one of its own.
 *
 * The millipede is camouflage from end to end. Its body is in sections of
 * two to four plates, each section mimicking something else: **rock** (the
 * caves' grey stone, speckled), **dirt** (the very ground it's on, its own
 * colours), **gems** (crystals of GEMM pink, turquoise and emerald set in
 * rock like a deposit, glinting) or **fauna** (coral flesh in one of the plants'
 * palettes, pored, polyps glowing at the tips). Every plate has a dark rim
 * and a pair of legs stepping under it; the head is coral, with feelers,
 * fangs and an eye.
 *
 * Frozen (lying in wait) it drops its rims, stops its legs and dims its
 * eye: it melts into the cave. Reared to spit, its hood spreads either side
 * of its neck like a coral sea fan: ribbed, glowing tips round its rim, a
 * turquoise gem eyespot each side.
 */

/** A fixed hash in [0, 1) of a few integers. */
const hsh = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Camouflage kinds. */
const Camo = { Rock: 0, Dirt: 1, Gem: 2, Fauna: 3 } as const;

/** Which camouflage segment `i` of a millipede (by its seed) wears: sections of two to four alike. */
export function camoOf(seed: number, i: number): number {
  let at = 1; // (the head is its own: coral)
  for (let sec = 0; sec < 16; sec++) {
    const len = 2 + Math.floor(hsh(seed, sec, 1) * 3);
    if (i < at + len) return Math.floor(hsh(seed, sec, 2) * 4);
    at += len;
  }
  return Camo.Rock;
}

const ROCK = ['#4a4650', '#5c5864', '#6e6a76', '#3a3640', '#807a88'];
const GEMS = [
  ['#ff2a8a', '#ff8ac4', '#ffe0f0'],
  ['#18c8c0', '#80fff0', '#e0fffc'],
  ['#22b85a', '#90ffb0', '#e8fff0'],
];

const css = (abgr: number) => `#${(abgr & 0xff).toString(16).padStart(2, '0')}${((abgr >> 8) & 0xff).toString(16).padStart(2, '0')}${((abgr >> 16) & 0xff).toString(16).padStart(2, '0')}`;
const shade = (hex: string, k: number) => {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * k)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

/** What the renderer tells us about the world: the colour of the ground at a cell (its palette's, as drawn: 0xAABBGGRR). */
export type GroundColor = (x: number, y: number) => number;

interface Seg {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  w: number;
  len: number;
  camo: number;
}

/** One plate, rasterised cell by cell. `rim`: its dark outline (dropped when frozen, the better to hide). */
function plate(ctx: CanvasRenderingContext2D, t: Terrain, ground: GroundColor, s: Seg, seed: number, i: number, rim: boolean, now: number): void {
  const R = Math.ceil(Math.max(s.len, s.w)) + 1;
  // The colours it takes on: dirt from the very ground beside it.
  let dirt = '#7a4a30';
  if (s.camo === Camo.Dirt) {
    for (let k = 2; k < 8; k++) {
      const gx = Math.round(s.x - s.nx * k);
      const gy = Math.round(s.y - s.ny * k);
      if (t.isSolid(gx, gy)) {
        dirt = css(ground(gx, gy));
        break;
      }
    }
  }
  const pal = CORAL_PALS[(seed + i) % CORAL_PALS.length];
  for (let py = Math.floor(s.y - R); py <= Math.ceil(s.y + R); py++) {
    for (let px = Math.floor(s.x - R); px <= Math.ceil(s.x + R); px++) {
      const dx = px + 0.5 - s.x;
      const dy = py + 0.5 - s.y;
      const u = dx * s.tx + dy * s.ty;
      const v = dx * s.nx + dy * s.ny;
      const e = (u / s.len) ** 2 + (v / s.w) ** 2;
      if (e > 1) continue;
      const h = hsh(px, py, seed);
      const top = v / s.w;
      let c: string;
      if (rim && e > 0.62) c = s.camo === Camo.Fauna || i === 0 ? pal[0] : '#1c1418';
      else if (i === 0 || s.camo === Camo.Fauna) {
        // Coral flesh: shaded across, pores, a polyp glowing here and there.
        c = top > 0.4 ? pal[4] : top > -0.1 ? pal[3] : top > -0.55 ? pal[2] : pal[1];
        if (h < 0.12) c = pal[1];
        else if (h > 0.95 && top > 0) c = pal[5];
      } else if (s.camo === Camo.Rock) {
        c = ROCK[Math.floor(h * 4)];
        if (top > 0.5 && h > 0.6) c = ROCK[4];
        if (top < -0.5) c = ROCK[3];
      } else if (s.camo === Camo.Dirt) {
        c = shade(dirt, top > 0.45 ? 1.18 : top < -0.45 ? 0.72 : 0.9 + h * 0.2);
        if (h < 0.08) c = shade(dirt, 0.6);
      } else {
        // Gems set in rock, like a GEMM deposit: crystals here and there (2x2 blocks), a facet lit on each, glinting.
        const gx = px >> 1;
        const gy = py >> 1;
        const gh = hsh(gx, gy, seed + 7);
        if (gh < 0.3) {
          const g = GEMS[Math.floor(hsh(gx, gy, seed + 9) * 3)];
          const lit = (px & 1) === 0 && (py & 1) === 0;
          const tw = (Math.sin(now / 260 + gh * 40) + 1) / 2;
          c = lit ? (tw > 0.85 ? g[2] : g[1]) : g[0];
        } else c = top < -0.5 ? ROCK[3] : ROCK[Math.floor(h * 3)];
      }
      ctx.fillStyle = c;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // The joint between plates: a dark line of cells across its back end.
  if (rim) {
    ctx.fillStyle = 'rgba(10,6,10,0.55)';
    for (let k = -s.w + 0.5; k <= s.w - 0.5; k += 1) ctx.fillRect(Math.round(s.x - s.tx * s.len * 0.92 + s.nx * k), Math.round(s.y - s.ty * s.len * 0.92 + s.ny * k), 1, 1);
  }
}

/** A line of single cells from (x0, y0) to (x1, y1). */
function pixLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
}

/** Per segment: where it is, along the body (toward the head), up off its ground, its girth and look. */
function segments(t: Terrain, pts: readonly number[], seed: number): Seg[] {
  const n = pts.length >> 1;
  const P = (i: number) => Math.max(0, Math.min(n - 1, i));
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    let tx = pts[P(i - 1) * 2] - pts[P(i + 1) * 2];
    let ty = pts[P(i - 1) * 2 + 1] - pts[P(i + 1) * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const up = openWay(t, x, y);
    let nx = -ty;
    let ny = tx;
    if (nx * up.x + ny * up.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const w = i === 0 ? 3.9 : 3.8 - (1.6 * i) / (n - 1);
    // (Its belly just over the ground, not sunk into it: up off it by its girth, its legs standing it there.)
    const lift = Math.max(0, w + 0.6);
    out.push({ x: x + nx * lift, y: y + ny * lift, tx, ty, nx, ny, w, len: i === 0 ? 3.4 : 2.9, camo: camoOf(seed, i) });
  }
  return out;
}

/**
 * Draw a millipede from its body points (head first, flat x, y pairs): its
 * camouflage seed, how far up it's reared (0..1), and frozen still or not.
 */
export function drawMillipede(ctx: CanvasRenderingContext2D, t: Terrain, ground: GroundColor, pts: readonly number[], seed: number, lift: number, frozen: boolean, now: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const seg = segments(t, pts, seed);
  const step = frozen ? 0 : now / 45;
  // Legs (under the plates): a pair to each, stepping in a wave down the body; still when it's frozen.
  for (let i = 1; i < n; i++) {
    const s = seg[i];
    const lifted = i < 5 && lift > 0.1;
    ctx.fillStyle = s.camo === Camo.Rock || s.camo === Camo.Gem ? '#2e2a34' : s.camo === Camo.Dirt ? '#3a2416' : CORAL_PALS[(seed + i) % CORAL_PALS.length][1];
    for (const side of [-1, 1]) {
      const ph = step + i * 0.9 + (side > 0 ? Math.PI : 0);
      const swing = frozen ? side * 0.8 : Math.sin(ph) * 1.5;
      const raise = frozen ? 0 : Math.max(0, Math.cos(ph)) * 1.2;
      const bx = s.x - s.nx * (s.w - 0.6) + s.tx * side * 1.1;
      const by = s.y - s.ny * (s.w - 0.6) + s.ty * side * 1.1;
      const reach = lifted ? 1.4 : 1.9 - raise * 0.5;
      const kx = bx - s.nx * reach * 0.5 + s.tx * (side * 1.6 + swing * 0.4);
      const ky = by - s.ny * reach * 0.5 + s.ty * (side * 1.6 + swing * 0.4);
      pixLine(ctx, bx, by, kx, ky);
      pixLine(ctx, kx, ky, bx - s.nx * reach + s.tx * (side * 1.2 + swing), by - s.ny * reach + s.ty * (side * 1.2 + swing));
    }
  }
  if (lift > 0.05) hood(ctx, seg[1], seed, lift, now);
  // The plates, tail to head (each over the one behind).
  for (let i = n - 1; i >= 0; i--) plate(ctx, t, ground, seg[i], seed, i, !frozen, now);
  // The head's own: feelers out ahead, fangs, an eye.
  const h = seg[0];
  const pal = CORAL_PALS[seed % CORAL_PALS.length];
  const wave = frozen ? 0 : Math.sin(now / 150);
  ctx.fillStyle = pal[4];
  for (const sd of [-1, 1]) {
    const ax = h.x + h.tx * 2.5 + h.nx * 1.5;
    const ay = h.y + h.ty * 2.5 + h.ny * 1.5;
    pixLine(ctx, ax, ay, ax + h.tx * 4 + h.nx * (1.5 + sd * 1.5 + wave * sd * 0.6), ay + h.ty * 4 + h.ny * (1.5 + sd * 1.5 + wave * sd * 0.6));
  }
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(Math.round(h.x + h.tx * 3.6 - h.nx * 0.8), Math.round(h.y + h.ty * 3.6 - h.ny * 0.8), 1, 1);
  ctx.fillRect(Math.round(h.x + h.tx * 3.6 - h.nx * 2.2), Math.round(h.y + h.ty * 3.6 - h.ny * 2.2), 1, 1);
  ctx.fillStyle = frozen ? '#3a2a30' : lift > 0.3 ? '#9affea' : '#e8fff4';
  ctx.fillRect(Math.round(h.x + h.tx * 1.4 + h.nx * 1.4), Math.round(h.y + h.ty * 1.4 + h.ny * 1.4), 1, 1);
}

/** The hood: a coral sea fan spread either side of the neck, ribbed, glowing at the rim, a gem eyespot each side. */
function hood(ctx: CanvasRenderingContext2D, s: Seg, seed: number, lift: number, now: number): void {
  const pal = CORAL_PALS[(seed >> 2) % CORAL_PALS.length];
  const spread = 2 + lift * 8;
  const deep = 2.2 + lift * 1.6;
  const R = Math.ceil(spread) + 2;
  // (Across the neck: its own frame is the neck's tangent and the perpendicular to it.)
  const ax = -s.ty;
  const ay = s.tx;
  for (let py = Math.floor(s.y - R); py <= Math.ceil(s.y + R); py++) {
    for (let px = Math.floor(s.x - R); px <= Math.ceil(s.x + R); px++) {
      const dx = px + 0.5 - s.x;
      const dy = py + 0.5 - s.y;
      const u = dx * s.tx + dy * s.ty;
      const v = dx * ax + dy * ay;
      const e = ((u + 0.6) / deep) ** 2 + (v / spread) ** 2;
      if (e > 1) continue;
      let c: string;
      if (e > 0.78) c = (Math.round(v) + Math.floor(now / 200)) % 3 === 0 ? pal[5] : pal[4]; // the rim, its tips glowing in turn
      else if (e > 0.62) c = pal[0];
      else {
        // Ribs fanning out from the neck.
        const ang = Math.atan2(v, u + 2.5);
        const rib = ((((ang * 5) % 1) + 1) % 1) < 0.22;
        c = rib ? pal[1] : hsh(px, py, seed) < 0.15 ? pal[3] : pal[2];
      }
      ctx.fillStyle = c;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  if (lift > 0.45) {
    for (const sd of [-1, 1]) {
      const ex = Math.round(s.x + ax * sd * spread * 0.55 - 1);
      const ey = Math.round(s.y + ay * sd * spread * 0.55 - 1);
      ctx.fillStyle = '#f4f0ff';
      ctx.fillRect(ex - 1, ey, 4, 2);
      ctx.fillRect(ex, ey - 1, 2, 4);
      ctx.fillStyle = '#18c8c0';
      ctx.fillRect(ex, ey, 2, 2);
      ctx.fillStyle = '#e0fffc';
      ctx.fillRect(ex, ey, 1, 1);
    }
  }
}

/** One segment of a dead millipede, flung off whole: at (x, y), turned to angle `a`. */
export function drawSegmentGib(ctx: CanvasRenderingContext2D, t: Terrain, ground: GroundColor, x: number, y: number, a: number, seed: number, i: number, now: number): void {
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const w = i === 0 ? 3.9 : 3.8 - (1.6 * i) / 14;
  plate(ctx, t, ground, { x, y, tx, ty, nx: -ty, ny: tx, w, len: i === 0 ? 3.4 : 2.9, camo: camoOf(seed, i) }, seed, i, true, now);
}
