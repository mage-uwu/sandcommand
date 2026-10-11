import { CORAL_PALS } from './flora-palette.ts';
import type { Terrain } from '../shared/terrain.ts';
import { ASP_R, MILLI_R, openWay } from '../shared/wildlife.ts';

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
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const up = openWay(t, x, y);
    const l = Math.hypot(tx, ty);
    if (l < 0.01) {
      // (Its points all in one spot (it's been stuck): lie along the ground.)
      tx = -up.y;
      ty = up.x;
    } else {
      tx /= l;
      ty /= l;
    }
    let nx = -ty;
    let ny = tx;
    if (nx * up.x + ny * up.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const w = i === 0 ? 3.9 : 3.8 - (1.6 * i) / (n - 1);
    // (Its belly just over the ground, not sunk into it: its points are already up off it by its
    // hit radius; the rest of its girth, and its legs standing it there.)
    const lift = Math.max(0, w + 0.6 - MILLI_R);
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
export function drawSegmentGib(ctx: CanvasRenderingContext2D, t: Terrain, ground: GroundColor, x: number, y: number, a: number, kind: number, seed: number, i: number, now: number): void {
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  // (An asp's segments: small, all gem: the rock was only ever skin-deep.)
  const asp = kind === 1;
  const w = asp ? (i === 0 ? 2.1 : 1.9 - i / 7) : i === 0 ? 3.9 : 3.8 - (1.6 * i) / 14;
  plate(ctx, t, ground, { x, y, tx, ty, nx: -ty, ny: tx, w, len: asp ? 1.9 : i === 0 ? 3.4 : 2.9, camo: asp ? Camo.Gem : camoOf(seed, i) }, seed, asp ? 1 : i, true, now);
}

/** The colour of the GEMM veins round a cell (the renderer's own: a disguise has to match), as [r, g, b]. */
export type GemTint = (x: number, y: number) => readonly [number, number, number];

/**
 * A gem asp, up and about: a slim, snakelike little cousin of the
 * millipede, banded in jewel-bright gem scales and rock, a fringe of tiny
 * legs under it; a gem-scaled head with fangs. Reared up hissing, a small
 * hood spreads and its forked tongue flickers.
 */
export function drawAsp(ctx: CanvasRenderingContext2D, t: Terrain, pts: readonly number[], seed: number, lift: number, now: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const P = (i: number) => Math.max(0, Math.min(n - 1, i));
  const gem = GEMS[seed % 3];
  const seg: Seg[] = [];
  for (let i = 0; i < n; i++) {
    let tx = pts[P(i - 1) * 2] - pts[P(i + 1) * 2];
    let ty = pts[P(i - 1) * 2 + 1] - pts[P(i + 1) * 2 + 1];
    const up = openWay(t, pts[i * 2], pts[i * 2 + 1]);
    const l = Math.hypot(tx, ty);
    if (l < 0.01) {
      // (Its points all in one spot (it's been stuck): lie along the ground.)
      tx = -up.y;
      ty = up.x;
    } else {
      tx /= l;
      ty /= l;
    }
    let nx = -ty;
    let ny = tx;
    if (nx * up.x + ny * up.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const w = i === 0 ? 2.1 : 1.9 - (1.0 * i) / (n - 1);
    const lift = w + 0.4 - ASP_R; // (its points are already up off the ground by its hit radius)
    seg.push({ x: pts[i * 2] + nx * lift, y: pts[i * 2 + 1] + ny * lift, tx, ty, nx, ny, w, len: i === 0 ? 2.4 : 1.9, camo: 0 });
  }
  // The leg fringe: one cell under each segment, flickering as it goes.
  for (let i = 1; i < n; i++) {
    const s = seg[i];
    ctx.fillStyle = '#2a2230';
    const sw = Math.round(Math.sin(now / 40 + i * 1.3));
    ctx.fillRect(Math.round(s.x - s.nx * (s.w + 0.6) + s.tx * sw), Math.round(s.y - s.ny * (s.w + 0.6) + s.ty * sw), 1, 1);
  }
  if (lift > 0.05) hoodSmall(ctx, seg[1], gem, lift);
  for (let i = n - 1; i >= 0; i--) {
    const s = seg[i];
    const band = i === 0 || Math.floor((i + (seed & 1)) / 2) % 2 === 0; // (bands: gem scales, rock)
    const R = Math.ceil(Math.max(s.len, s.w)) + 1;
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
        if (e > 0.7) c = '#120c16';
        else if (band) c = top > 0.3 ? (h > 0.85 ? gem[2] : gem[1]) : gem[0];
        else c = top > 0.3 ? ROCK[2] : ROCK[Math.floor(h * 2)];
        ctx.fillStyle = c;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
  // Fangs, an eye, and (hissing) a forked tongue flickering out.
  const h = seg[0];
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(Math.round(h.x + h.tx * 2.4 - h.nx * 0.8), Math.round(h.y + h.ty * 2.4 - h.ny * 0.8), 1, 1);
  ctx.fillStyle = lift > 0.3 ? '#ff4a6a' : '#fff8d0';
  ctx.fillRect(Math.round(h.x + h.tx * 0.9 + h.nx * 0.8), Math.round(h.y + h.ty * 0.9 + h.ny * 0.8), 1, 1);
  if (lift > 0.3 && Math.floor(now / 90) % 2 === 0) {
    ctx.fillStyle = '#e0204a';
    pixLine(ctx, h.x + h.tx * 2.6, h.y + h.ty * 2.6, h.x + h.tx * 4.6, h.y + h.ty * 4.6);
    ctx.fillRect(Math.round(h.x + h.tx * 5.4 + h.nx), Math.round(h.y + h.ty * 5.4 + h.ny), 1, 1);
    ctx.fillRect(Math.round(h.x + h.tx * 5.4 - h.nx), Math.round(h.y + h.ty * 5.4 - h.ny), 1, 1);
  }
}

/** An asp's small hood, flared as it hisses: gem-bright, a dark rim. */
function hoodSmall(ctx: CanvasRenderingContext2D, s: Seg, gem: readonly string[], lift: number): void {
  const spread = 1.5 + lift * 3.2;
  const deep = 1.6;
  const ax = -s.ty;
  const ay = s.tx;
  const R = Math.ceil(spread) + 1;
  for (let py = Math.floor(s.y - R); py <= Math.ceil(s.y + R); py++) {
    for (let px = Math.floor(s.x - R); px <= Math.ceil(s.x + R); px++) {
      const dx = px + 0.5 - s.x;
      const dy = py + 0.5 - s.y;
      const e = ((dx * s.tx + dy * s.ty) / deep) ** 2 + ((dx * ax + dy * ay) / spread) ** 2;
      if (e > 1) continue;
      ctx.fillStyle = e > 0.6 ? '#120c16' : e > 0.3 ? gem[0] : gem[1];
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

/**
 * An asp curled up as a gem: a cluster of pointed crystal prisms standing
 * up off the floor, shaded exactly as the GEMM crystals in the ground are
 * (the veins' own colour there, the same facets, edges and glints), so it
 * passes for one. Its one tell: now and then, for a moment, a flick of red
 * tongue at its foot.
 */
export function drawAspGem(ctx: CanvasRenderingContext2D, t: Terrain, tint: GemTint, pts: readonly number[], seed: number, now: number): void {
  const n = pts.length >> 1;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += pts[i * 2];
    cy += pts[i * 2 + 1];
  }
  cx /= n;
  cy /= n;
  const up = openWay(t, cx, cy);
  // Its foot: down on the floor under it.
  let bx = cx;
  let by = cy;
  for (let k = 0; k < 6 && !t.isSolid(Math.floor(bx - up.x), Math.floor(by - up.y)); k++) {
    bx -= up.x;
    by -= up.y;
  }
  const upA = Math.atan2(up.y, up.x);
  const prisms: { a: number; len: number; half: number }[] = [];
  const count = 2 + Math.floor(hsh(seed, 1, 3) * 2);
  for (let k = 0; k < count; k++) prisms.push({ a: upA + (k - (count - 1) / 2) * (0.4 + hsh(seed, k, 4) * 0.3), len: 7 + hsh(seed, k, 5) * 4, half: 1.6 + hsh(seed, k, 6) * 0.6 });
  const inside = (x: number, y: number) => {
    for (const p of prisms) {
      const dx = x + 0.5 - bx;
      const dy = y + 0.5 - by;
      const c = Math.cos(p.a);
      const s = Math.sin(p.a);
      const along = dx * c + dy * s;
      const across = Math.abs(-dx * s + dy * c);
      if (along < -1 || along > p.len) continue;
      const tip = p.len - 3;
      const w = along > tip ? p.half * (1 - (along - tip) / 3) : p.half;
      if (across <= w) return true;
    }
    return false;
  };
  const [r, g, b] = tint(Math.round(bx), Math.round(by));
  const R = 13;
  for (let y = Math.floor(by - R); y <= Math.ceil(by + R); y++) {
    for (let x = Math.floor(bx - R); x <= Math.ceil(bx + R); x++) {
      if (!inside(x, y)) continue;
      // (gemCrystalColor's own shading: facets in diagonal bands, lit upper-left edges, dark lower-right, a glint now and then.)
      let k = [1.18, 1.0, 0.88, 1.36][((x - y) >> 1) & 3];
      if (!inside(x, y - 1) || !inside(x - 1, y)) k = 1.5;
      else if (!inside(x, y + 1) || !inside(x + 1, y)) k = 0.6;
      const h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
      const c = (h & 15) === 0 ? [255, 255, 255] : [(r * 0.8 + 50) * k, (g * 0.8 + 50) * k, (b * 0.8 + 50) * k];
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(c[0]))},${Math.min(255, Math.round(c[1]))},${Math.min(255, Math.round(c[2]))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // The tell.
  if (Math.floor(now / 150 + seed * 7) % 28 === 0) {
    ctx.fillStyle = '#e0204a';
    const s = Math.cos(upA + Math.PI / 2);
    const c2 = Math.sin(upA + Math.PI / 2);
    ctx.fillRect(Math.round(bx + up.x + s * 3), Math.round(by + up.y + c2 * 3), 1, 1);
    ctx.fillRect(Math.round(bx + up.x + s * 4), Math.round(by + up.y + c2 * 4), 1, 1);
  }
}

/** A seeder's wing paints, by its seed: ground, rim, eyespot. */
const WING_PAINTS = [
  ['#ff5a8c', '#140c14', '#40f0e0'],
  ['#ff9a3a', '#140c14', '#fff4e0'],
  ['#b05aff', '#140c14', '#ffd040'],
  ['#40d8c0', '#140c14', '#ff5a8c'],
];

/**
 * A seeder, about a clone's head in size: a raven's glossy black head and
 * a pale beak, a wasp's striped abdomen with its sting, and a butterfly's
 * painted wings (black rims, an eyespot) beating fast over its back. `pts`:
 * its head, then its tail (the way it's going).
 */
export function drawSeeder(ctx: CanvasRenderingContext2D, pts: readonly number[], seed: number, now: number): void {
  const x = pts[0];
  const y = pts[1];
  let tx = x - pts[2];
  let ty = y - pts[3];
  const l = Math.hypot(tx, ty);
  if (l < 0.01) {
    tx = 1;
    ty = 0;
  } else {
    tx /= l;
    ty /= l;
  }
  // Its back: up the screen, whichever way it's going.
  let nx = -ty;
  let ny = tx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const put = (u: number, v: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + u * tx + v * nx - 0.5), Math.round(y + u * ty + v * ny - 0.5), 1, 1);
  };
  /** An ellipse in its own frame (centre u, v; half-lengths a, b), coloured by `col(e, u, v)` (e: 0 centre, 1 rim). */
  const blob = (cu: number, cv: number, a: number, b: number, col: (e: number, u: number, v: number) => string | null) => {
    const R = Math.ceil(Math.max(a, b)) + 1;
    for (let v = -R; v <= R; v++) {
      for (let u = -R; u <= R; u++) {
        const e = ((u + 0.5 - 0.5) / a) ** 2 + (v / b) ** 2;
        if (e > 1) continue;
        const c = col(e, cu + u, cv + v);
        if (c) put(cu + u, cv + v, c);
      }
    }
  };
  const paint = WING_PAINTS[seed % WING_PAINTS.length];
  // The beat: wing tips swing from over its back to under its belly, fast.
  const beat = Math.sin(now / 26 + seed);
  // (Never edge on: a butterfly's wings always show some of their paint.)
  const tip = (beat < 0 ? -1 : 1) * (2.4 + 2.6 * Math.abs(beat));
  const wing = (cu: number, len: number, reach: number, dark: boolean) => {
    blob(cu, reach / 2 + Math.sign(reach) * 0.5, len, Math.abs(reach) / 2 + 0.3, (e, u, v) => {
      if (e > 0.7) return paint[1];
      const spot = (u - cu) ** 2 + (v - reach * 0.55) ** 2 < 1.1;
      const c = spot ? paint[2] : hsh(Math.round(u * 3), Math.round(v * 3), seed) > 0.8 ? shade(paint[0], 1.3) : paint[0];
      return dark ? shade(c, 0.6) : c;
    });
  };
  // The far wings, behind its body.
  wing(-1, 2, tip * 0.8, true);
  // The wasp's abdomen, banded black and gold a cell at a time, and its sting.
  blob(-3, -0.3, 2.1, 1.2, (_e, u) => (Math.floor(u + 9) % 2 ? '#1c1418' : '#ffc040'));
  put(-5.4, -0.8, '#f4ecd8');
  // Legs, dangling.
  put(0, -1.6, '#2a2430');
  put(-1, -1.8, '#2a2430');
  // The raven's head and breast: glossy black, a blue sheen on top; its beak, its eye.
  blob(0.9, 0.1, 1.4, 1.1, (e, _u, v) => (v > 0.6 && e < 0.7 ? '#4a5878' : '#16121c'));
  put(2.6, 0, '#b8b0a8');
  put(3.5, -0.2, '#d8d0c4');
  put(1.4, 0.6, Math.floor(now / 400 + seed) % 7 === 0 ? '#16121c' : '#ff3a5a');
  // The near wings, over it.
  wing(0, 2.6, tip, false);
}

/**
 * A coral nest: a hive of papery coral hung off the rock (a roof, a wall)
 * by a stalk, banded in pinks, pocked with dark cells, polyps glowing
 * round it, and at its open end a mouth with something stirring inside it.
 * Hurt, it cracks.
 */
export function drawNest(ctx: CanvasRenderingContext2D, t: Terrain, x: number, y: number, seed: number, hp: number, now: number): void {
  const open = openWay(t, x, y);
  const ax = open.x;
  const ay = open.y;
  const bx = -ay;
  const by = ax;
  // The stalk back to the rock.
  ctx.fillStyle = '#8a2a50';
  pixLine(ctx, x, y, x - ax * 8, y - ay * 8);
  ctx.fillStyle = '#5a1838';
  pixLine(ctx, x + bx, y + by, x - ax * 7 + bx, y - ay * 7 + by);
  const R = 9;
  const glow = 0.5 + 0.5 * Math.sin(now / 300 + seed);
  for (let py = Math.floor(y - R); py <= Math.ceil(y + R); py++) {
    for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const a = dx * ax + dy * ay; // along it: + toward its mouth
      const b = dx * bx + dy * by;
      // A teardrop: narrow at the stalk, swelling, rounded off at the mouth; its rim lumpy.
      const th = Math.atan2(b, a);
      const lump = 0.8 * Math.sin(th * 5 + seed) + 0.5 * Math.sin(th * 9 + seed * 2);
      const w = 5.2 * Math.sqrt(Math.max(0, 1 - ((a - 0.8) / 7) ** 2)) * (0.75 + 0.25 * Math.min(1, (a + 6) / 6)) + lump * 0.5;
      if (Math.abs(b) > w || a < -6.2 || a > 7.4 + lump * 0.4) continue;
      const edge = Math.abs(b) > w - 1 || a > 6.6 + lump * 0.4;
      const h = hsh(px, py, seed);
      let c: string;
      if (edge) c = '#3a0c22';
      else {
        // Bands of papery coral, layered down it.
        const band = Math.floor((a + 8 + Math.sin(b * 0.9 + seed) * 0.8) / 2.1) % 3;
        c = band === 0 ? '#ff6a9c' : band === 1 ? '#e44a82' : '#ff8aa8';
        if (h > 0.9) c = '#ffc0d4';
        // Its cells: dark pocks.
        if (hsh(Math.floor(px / 2), Math.floor(py / 2), seed + 7) > 0.86 && h > 0.3) c = '#2a0818';
        // Its mouth, at the open end, glowing from within.
        if (a > 4.2 && Math.abs(b) < 1.8) c = h > 0.5 ? (glow > 0.5 ? '#ffd060' : '#ff9a40') : '#401020';
        // Hurt: cracks.
        if (hp < 0.6 && hsh(Math.floor(px + py * 0.5), 0, seed + 3) > 0.55 + hp * 0.7 && Math.abs((px * 3 + py * 5 + seed) % 11) < 1) c = '#200410';
      }
      ctx.fillStyle = c;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // Polyps round it, their tips glowing.
  for (let k = 0; k < 7; k++) {
    const th = (k / 7) * Math.PI * 2 + seed;
    const a = Math.cos(th) * 5;
    const b = Math.sin(th) * 5.6;
    const px = x + ax * a + bx * b;
    const py = y + ay * a + by * b;
    if (a < -4) continue;
    ctx.fillStyle = (Math.floor(now / 250) + k) % 4 === 0 ? '#fff4b0' : '#ffb0d0';
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
}

/** A seeder's or a nest's pieces, tumbling: a wing (or a body) of a seeder, a shard of coral nest. */
export function drawCritterGib(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, kind: number, seed: number, i: number): void {
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const put = (u: number, v: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + u * tx - v * ty), Math.round(y + u * ty + v * tx), 1, 1);
  };
  if (kind === 2) {
    const paint = WING_PAINTS[seed % WING_PAINTS.length];
    if (i === 0) {
      for (let u = -1; u <= 1; u++) put(u, 0, '#16121c');
      put(2, 0, '#b8b0a8');
    } else {
      for (let u = -1; u <= 1; u++) for (let v = 0; v <= 2; v++) put(u, v, v === 2 || Math.abs(u) === 1 ? paint[1] : paint[0]);
      put(0, 1, paint[2]);
    }
    return;
  }
  const pinks = ['#ff6a9c', '#e44a82', '#ff8aa8', '#ffc0d4'];
  for (let u = -1; u <= 1; u++) for (let v = -1; v <= 0; v++) if (hsh(u, v, seed + i) > 0.2) put(u, v, pinks[(i + u + 3) % 4]);
  put(0, 1, '#2a0818');
}

/**
 * The nest a seeder's sting sows, growing out of a clone's limb: a little
 * hive of the coral nest's own papery stuff budding from the limb's cells
 * (x0..x1, y0..y1), out the way `ox` (-1, 1: away from the body), swelling
 * the more grown it is (0..1). It's banded in the nest's pinks and pocked
 * with dark cells, the limb crusting over with it as it spreads. Well
 * grown, a mouth opens at its tip and glows, and something stirs in it.
 */
export function drawCoralGrowth(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ox: number, grown: number, seed: number, now: number): void {
  // The limb crusting over with it (more of it, the further along).
  if (grown > 0.3) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (hsh(x - x0, y - y0, seed) > (grown - 0.3) * 1.4) continue;
        ctx.fillStyle = hsh(x - x0, y - y0, seed + 1) > 0.8 ? '#2a0818' : hsh(x - x0, y - y0, seed + 2) > 0.5 ? '#e44a82' : '#ff8aa8';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // The hive budding out of it: a lumpy teardrop, its stalk in the limb, its mouth outward.
  const R = 1.2 + grown * 4.2;
  const ax = ox;
  const ay = -0.25; // (tilted a touch upward, as a nest hangs off its stalk)
  const al = Math.hypot(ax, ay);
  const ux = ax / al;
  const uy = ay / al;
  const vx = -uy;
  const vy = ux;
  const bx = (x0 + x1 + 1) / 2 + ox * ((x1 - x0 + 1) / 2);
  const by = (y0 + y1 + 1) / 2;
  const cx = bx + ux * R * 0.9;
  const cy = by + uy * R * 0.9;
  const glow = 0.5 + 0.5 * Math.sin(now / 300 + seed);
  const ext = Math.ceil(R + 2);
  for (let py = Math.floor(cy - ext); py <= Math.ceil(cy + ext); py++) {
    for (let px = Math.floor(cx - ext); px <= Math.ceil(cx + ext); px++) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      const a = (dx * ux + dy * uy) / R; // along it: -1 at the stalk, +1 at the mouth
      const b = (dx * vx + dy * vy) / R;
      const th = Math.atan2(b, a);
      const lump = 0.12 * Math.sin(th * 5 + seed) + 0.07 * Math.sin(th * 9 + seed * 2);
      // Narrow at the stalk, swelling toward the mouth.
      const w = Math.sqrt(Math.max(0, 1 - a * a)) * (0.55 + 0.35 * (a + 1) * 0.5) + lump;
      if (Math.abs(b) > w || a < -1 || a > 1 + lump) continue;
      const edge = R > 2 && (Math.abs(b) > w - 1 / R || a > 1 + lump - 1 / R);
      const h = hsh(px, py, seed);
      let c: string;
      if (edge) c = '#3a0c22';
      else {
        const band = Math.floor((a * R + 8 + Math.sin(b * R * 0.9 + seed) * 0.8) / 1.6) % 3;
        c = band === 0 ? '#ff6a9c' : band === 1 ? '#e44a82' : '#ff8aa8';
        if (h > 0.92) c = '#ffc0d4';
        // Its cells.
        if (hsh(Math.floor(px / 2), Math.floor(py / 2), seed + 7) > 0.84 && h > 0.35) c = '#2a0818';
        // Its mouth, once it's grown: glowing from within, something stirring.
        if (grown > 0.55 && a > 0.55 && Math.abs(b) < 0.35) c = h > 0.5 ? (glow > 0.5 ? '#ffd060' : '#ff9a40') : '#401020';
      }
      ctx.fillStyle = c;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // Nearly ripe: a wing's flicker at its mouth.
  if (grown > 0.8 && Math.floor(now / 180 + seed) % 5 === 0) {
    ctx.fillStyle = '#fff4b0';
    ctx.fillRect(Math.round(cx + ux * R), Math.round(cy + uy * R) - 1, 1, 1);
  }
}

/** A basilisk's camouflage sections: a great GEMM vein, dripstone, coral grown over it. */
const BasCamo = { Vein: 0, Drip: 1, Coral: 2 } as const;
const basCamoOf = (seed: number, i: number) => {
  let at = 1;
  for (let sec = 0; sec < 12; sec++) {
    const len = 2 + Math.floor(hsh(seed, sec, 7) * 2);
    if (i < at + len) return Math.floor(hsh(seed, sec, 8) * 3);
    at += len;
  }
  return BasCamo.Drip;
};
const BAS_ROCK = ['#2e2a34', '#3a3540', '#46404c', '#524a56'];
const DRIP = ['#6e6658', '#827a6a', '#988e7c', '#ada290'];
const BAS_CORAL = ['#c83c6c', '#e8507e', '#ff7aa0', '#ffb0c8'];

/** Its flesh where plate gives way: membranes, blotches, pores; its cilia. */
const BAS_FLESH = ['#4a3440', '#6a4652', '#8a5a66', '#a87482'];
const CILIA = ['#c8b4a8', '#e0d0c4'];
/** Its flytrap jaws: grey flaps, veined, rimmed with long teeth. */
const FLAP = ['#5e5e66', '#76767e', '#8e8e96', '#aeaeb6'];
const TOOTH = ['#d8d0bc', '#f4ecd8'];
/** Plain cave stone (its head, at rest): mottled greys and a fleck of light. */
const STONE = ['#46424c', '#56525c', '#66626c', '#76727c', '#9a96a0'];

/**
 * A basilisk, in pixels: three times a millipede. Its body is in long
 * sections of lumpy plate, each dressed as something the caves are made of:
 * a great **GEMM vein** (seams of pink, turquoise or emerald crystal
 * wandering through dark rock), **dripstone** (layered pale stone,
 * stalactites hanging off its underside) or **coral** grown over it. But
 * it's alive under it: fleshy membrane shows round the plates' rims,
 * blotched and pored, and fringes of **cilia** wave along its underside
 * (and over the coral's back), stirring as it moves.
 *
 * Its head is a pointed wedge, and its front a **flytrap**: two grey flaps,
 * veined, hinged at the back, their rims set with long teeth. Shut (asleep,
 * or calm), the teeth interlock along the seam. In its frenzy the flaps
 * gape open, working, over a red maw, and its eyes burn. Asleep
 * (`frozen`) it has no outline, no eye, and its cilia hang still: a seam
 * in the cave wall.
 */
export function drawBasilisk(ctx: CanvasRenderingContext2D, pts: readonly number[], seed: number, frozen: boolean, frenzy: boolean, now: number): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  const P = (i: number) => Math.max(0, Math.min(n - 1, i));
  const gem = GEMS[seed % 3];
  const R0 = 11;
  const put = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  // Each segment's frame: centre, along (t), across (n: toward its back, up the screen where it can).
  const seg = (i: number) => {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    let tx = pts[P(i - 1) * 2] - pts[P(i + 1) * 2];
    let ty = pts[P(i - 1) * 2 + 1] - pts[P(i + 1) * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    let nx = -ty;
    let ny = tx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x, y, tx, ty, nx, ny };
  };
  const sway = (k: number) => (frozen ? 0 : Math.sin(now / 180 + k * 0.9) * 1.2);
  /** A cell of a section's camouflage (at u along it, v across, its girth w). */
  const camoPixel = (camo: number, px: number, py: number, u: number, v: number, w: number, i: number): string => {
    const h = hsh(px, py, seed);
    if (camo === BasCamo.Vein) {
      const seam = Math.abs(v - w * 0.35 * Math.sin(u * 0.28 + seed + i * 1.7));
      const seam2 = Math.abs(v + w * 0.45 - w * 0.2 * Math.sin(u * 0.5 + seed * 2));
      const cluster = hsh(Math.floor(px / 3), Math.floor(py / 3), seed + 11) > 0.82 && seam < w * 0.55;
      if (seam < 1.6 || seam2 < 0.8 || cluster) return h > 0.88 ? gem[2] : (px + py) % 3 === 0 ? gem[1] : gem[0];
      return BAS_ROCK[Math.floor(h * 4)];
    }
    if (camo === BasCamo.Drip) {
      const layer = Math.floor((py + Math.sin(px * 0.3 + seed) * 1.5) / 2) % 4;
      return DRIP[(layer + (h > 0.85 ? 1 : 0)) % 4];
    }
    if (h < 0.07) return '#5a1830';
    return h > 0.88 ? BAS_CORAL[3] : BAS_CORAL[Math.floor(hsh(Math.floor(px / 2), Math.floor(py / 2), seed + 5) * 3)];
  };

  for (let i = n - 1; i >= 1; i--) {
    const { x, y, tx, ty, nx, ny } = seg(i);
    const w = R0 * (1 - (0.42 * i) / (n - 1));
    const len = 10;
    const camo = basCamoOf(seed, i);
    // Cilia in places (under the coral, and every third section): fine fleshy hairs out from its body, waving.
    if (camo === BasCamo.Coral || i % 3 === 1) {
      for (let k = -2; k <= 2; k++) {
        const bx = x + tx * k * 3.2;
        const by = y + ty * k * 3.2;
        const reach = w * 0.9;
        for (const side of camo === BasCamo.Coral ? [1, -1] : [1]) {
          const ox = bx - nx * side * reach;
          const oy = by - ny * side * reach;
          const hl = 2 + ((i + k) & 1);
          for (let s = 0; s < hl; s++) put(ox - nx * side * s + tx * sway(i * 7 + k) * (s / hl), oy - ny * side * s + ty * sway(i * 7 + k) * (s / hl), s === hl - 1 ? CILIA[0] : BAS_FLESH[3]);
        }
      }
    }
    const R = Math.ceil(Math.max(w, len)) + 2;
    for (let py = Math.floor(y - R); py <= Math.ceil(y + R); py++) {
      for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        const u = dx * tx + dy * ty;
        const v = dx * nx + dy * ny;
        // A lumpy plate, not a clean oval.
        const th = Math.atan2(v, u);
        const lump = 1 + 0.09 * Math.sin(th * 5 + i * 1.3 + seed) + 0.05 * Math.sin(th * 9 + seed);
        const e = ((u / len) ** 2 + (v / w) ** 2) / (lump * lump);
        if (e > 1) continue;
        const h = hsh(px, py, seed);
        let c: string;
        if (e > 0.86 && !frozen) c = '#120e14';
        else if (e > 0.62 && hsh(Math.floor(px / 2), Math.floor(py / 2), seed + i * 3) > 0.45) {
          // Round the rim, where plate gives way: fleshy membrane, blotched, pored.
          c = h < 0.08 ? '#2a1820' : BAS_FLESH[Math.floor(hsh(Math.floor(px / 3), Math.floor(py / 3), seed + 9) * 4)];
        } else c = camoPixel(camo, px, py, u, v, w, i);
        ctx.fillStyle = c;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    if (camo === BasCamo.Drip) {
      for (let s = 0; s < 3; s++) {
        const ox = x + tx * (s - 1) * len * 0.6;
        const sl = 3 + Math.floor(hsh(i, s, seed) * 6);
        const by = y + w * 0.7;
        ctx.fillStyle = DRIP[1];
        for (let k = 0; k < sl; k++) ctx.fillRect(Math.round(ox - (k < sl / 2 ? 1 : 0)), Math.round(by + k), k < sl / 2 ? 2 : 1, 1);
        ctx.fillStyle = DRIP[3];
        ctx.fillRect(Math.round(ox), Math.round(by), 1, 1);
      }
    }
    if (camo === BasCamo.Coral) {
      for (let s = 0; s < 3; s++) {
        const ox = x + tx * (s - 1) * len * 0.55 + nx * w * 0.6;
        const oy = y + ty * (s - 1) * len * 0.55 + ny * w * 0.6;
        put(ox, oy, frozen ? BAS_CORAL[2] : (Math.floor(now / 300) + s + i) % 3 === 0 ? '#fff4b0' : BAS_CORAL[3]);
      }
    }
  }

  // The head: a pointed wedge, its front a flytrap of two grey flaps (rasterised a pixel at a time through each flap's own frame).
  const { x, y, tx, ty } = seg(0);
  // (Across, signed the head's own way, so the flaps open either side of its line.)
  const nx = -ty;
  const ny = tx;
  const W = 13;
  const back = 8; // (its skull, behind the hinge)
  const L = 20; // (the flaps' length, hinge to tip)
  const gape = frenzy ? 0.3 + 0.16 * Math.sin(now / 70) : 0;
  // At rest, its head is plain stone: the shut flytrap a boulder of mottled grey, cracked, flecked, its teeth and cilia drawn in.
  const stone = (px: number, py: number): string => {
    const blot = hsh(Math.floor(px / 3), Math.floor(py / 3), seed + 21);
    const h = hsh(px, py, seed + 4);
    // Hairline cracks: a couple of wandering lines through it.
    if (Math.abs(((px * 0.9 + py * 1.7 + Math.sin(py * 0.4 + seed) * 3) % 17) - 8.5) < 0.45 && h > 0.25) return '#2e2a32';
    if (h > 0.94) return STONE[4];
    return STONE[Math.min(3, Math.floor(blot * 3) + (h > 0.7 ? 1 : 0))];
  };
  const local = (u: number, v: number) => ({ x: x + tx * u + nx * v, y: y + ty * u + ny * v });
  const span = L + W + 4;
  for (let py = Math.floor(y - span); py <= Math.ceil(y + span); py++) {
    for (let px = Math.floor(x - span); px <= Math.ceil(x + span); px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const u = dx * tx + dy * ty;
      const v = dx * nx + dy * ny;
      let c: string | null = null;
      // A flap (or its teeth): into each flap's frame, unswung.
      for (const side of [-1, 1]) {
        const a = side * gape;
        const fu = u * Math.cos(a) + v * Math.sin(a);
        const fv = (-u * Math.sin(a) + v * Math.cos(a)) * side; // (0 at its inner rim, out toward its outer edge)
        if (fu < 0 || fu > L) continue;
        const half = W * (1 - fu / L);
        // Teeth: long pale spikes off its inner rim, across the seam (shut, they interlock with the other's).
        const tu = (fu - 2 + (side > 0 ? 1.25 : 0)) % 2.5;
        if (!frozen && fv < 0 && fv > -3.6 && fu > 2 && fu < L - 2 && Math.abs(tu - 1.25) < 0.55 - (-fv / 3.6) * 0.3) {
          c = fv < -2.6 ? TOOTH[1] : TOOTH[0];
          break;
        }
        if (fv < 0 || fv > half) continue;
        const rim = fv > half - 1.1;
        const vein = Math.abs(((fu * 0.7 + fv * 1.3) % 4) - 2) < 0.35;
        const hh = hsh(px, py, seed + side);
        c = frozen ? stone(px, py) : rim ? '#36363e' : fv < 1.4 ? FLAP[3] : vein ? FLAP[0] : FLAP[1 + (hh > 0.62 ? 1 : 0)];
        break;
      }
      if (!c && gape > 0 && u > 0 && u < L && Math.abs(v) < Math.tan(gape) * u) {
        // The maw between them: dark red, deep.
        c = u > L * 0.55 ? '#1a0406' : Math.abs(v) > Math.tan(gape) * u - 1.3 ? '#7a1418' : '#3a0608';
      }
      if (!c && u <= 0.5 && u >= -back) {
        // Its skull: the back of the wedge, dark plate, a lighter crest.
        const half = W * (1 - Math.max(0, -u - back * 0.45) / back);
        if (Math.abs(v) <= half) c = frozen ? stone(px, py) : Math.abs(v) > half - 1.1 ? '#120e14' : Math.abs(v) < 2 ? BAS_ROCK[3] : BAS_ROCK[1 + Math.floor(hsh(px, py, seed) * 2)];
      }
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
  // Cilia along the flaps' outer edges: fine hairs, waving (drawn in, at rest).
  for (const side of frozen ? [] : [-1, 1]) {
    const a = side * gape;
    for (let fu = 2; fu < L - 3; fu += 3) {
      const half = W * (1 - fu / L);
      for (let s = 1; s <= 2; s++) {
        const fv = side * (half + s);
        const p = local(fu * Math.cos(a) - fv * Math.sin(a), fu * Math.sin(a) + fv * Math.cos(a));
        put(p.x + (s === 2 ? sway(fu + side * 5) * 0.6 : 0), p.y, s === 2 ? CILIA[1] : CILIA[0]);
      }
    }
  }
  // Its eyes, on the skull either side; in its frenzy, red and burning.
  if (!frozen) {
    for (const side of [-1, 1]) {
      const e = local(-2, side * W * 0.5);
      if (frenzy) {
        ctx.fillStyle = `rgba(255,40,30,${0.3 + 0.2 * Math.sin(now / 80)})`;
        ctx.fillRect(Math.round(e.x) - 2, Math.round(e.y) - 2, 5, 5);
        put(e.x, e.y, '#ff3a2a');
        put(e.x + 1, e.y, '#ff3a2a');
        put(e.x, e.y, '#ffe0a0');
      } else put(e.x, e.y, '#c08030');
    }
  }
}

/** A chunk of a dead basilisk, tumbling: plate dressed as its section was (vein, dripstone, coral). */
export function drawBasiliskGib(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, seed: number, i: number): void {
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const camo = i === 0 ? -1 : basCamoOf(seed, i);
  const gem = GEMS[seed % 3];
  for (let v = -4; v <= 4; v++) {
    for (let u = -6; u <= 6; u++) {
      if ((u / 6.5) ** 2 + (v / 4.5) ** 2 > 1) continue;
      const h = hsh(u, v, seed + i);
      const c = camo === BasCamo.Vein ? (Math.abs(u + v) < 2 ? gem[h > 0.7 ? 1 : 0] : BAS_ROCK[Math.floor(h * 4)]) : camo === BasCamo.Drip ? DRIP[Math.floor(h * 4)] : camo === BasCamo.Coral ? BAS_CORAL[Math.floor(h * 3)] : BAS_ROCK[1 + Math.floor(h * 2)];
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + u * tx - v * ty), Math.round(y + u * ty + v * tx), 1, 1);
    }
  }
}
