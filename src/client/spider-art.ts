import type { Terrain } from '../shared/terrain.ts';
import type { GroundColor } from './beast-art.ts';

/**
 * The cave spider, in pixels (wildlife.ts CSPIDER_*): the spider droid's
 * build gone organic. A knobbly head (the cephalothorax) and a fat abdomen
 * behind it, slung between eight long legs; each leg a two-bone limb, the
 * knee bent up off the ground, its foot planted on the rock (floor, wall or
 * ceiling, whatever it holds) until the body has moved on far enough, then
 * a quick arc onto a new hold, in two alternating sets (the droid's gait,
 * eight legs to its six, and quicker).
 *
 * Its camouflage is the caves' own: its hide takes the colour of the very
 * ground under it, mottled with the rock's greys and grit, a dark folium
 * down its abdomen, and one GEMM crystal set into its back. Lying in wait
 * it presses flat to the rock with its legs splayed wide, its outline gone
 * and its eyes dull: a lump of the stone. Hunting, its outline sharpens,
 * its eyes catch the light red, and dashing or leaping its fangs come out.
 */

const hsh = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const rgbOf = (abgr: number): [number, number, number] => [abgr & 0xff, (abgr >> 8) & 0xff, (abgr >> 16) & 0xff];
const css = (c: readonly number[], k = 1) => `rgb(${Math.max(0, Math.min(255, Math.round(c[0] * k)))},${Math.max(0, Math.min(255, Math.round(c[1] * k)))},${Math.max(0, Math.min(255, Math.round(c[2] * k)))})`;
/** The rock's own greys it's mottled with, and its outline. */
const ROCK: readonly (readonly number[])[] = [
  [74, 70, 80],
  [92, 88, 100],
  [58, 54, 64],
];
const OUTLINE = '#140e10';
const FANG = '#d8ccb0';

/** Legs, back to front (hips along the head, cells from its centre; where each foot rests, cells along the body from its middle). */
const HIP = [-1.7, -1.2, -0.7, -0.2, 0.3, 0.8, 1.3, 1.8];
const REST = [-12, -9, -5.5, -2.5, 3, 6.5, 10, 13.5];
/** Which of the two alternating sets each leg steps with. */
const SET = [0, 1, 1, 0, 0, 1, 1, 0];
/** Thigh and shin (cells); how far a foot may lag before it steps; how long a step takes (s). */
const THIGH = 7.5;
const SHIN = 10;
const STRIDE = 3.4;
const STEP_TIME = 0.06;

interface Gait {
  seed: number;
  x: Float32Array;
  y: Float32Array;
  fx: Float32Array;
  fy: Float32Array;
  t: Float32Array;
  at: number;
  init: boolean;
}
const gaits = new Map<number, Gait>();

/** The way out of the rock from (x, y): away from the solid cells round it (out to 7 cells: its body stands well off the ground). */
function openFrom(t: Terrain, x: number, y: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      if ((dx === 0 && dy === 0) || !t.isSolid(cx + dx, cy + dy)) continue;
      const w = 1 / (dx * dx + dy * dy);
      sx -= dx * w;
      sy -= dy * w;
    }
  }
  const l = Math.hypot(sx, sy);
  return l < 1e-6 ? { x: 0, y: -1 } : { x: sx / l, y: sy / l };
}

/**
 * Draw a cave spider from its body points (head, abdomen): its `slot` (its
 * feet are remembered by it), camouflage seed, fangs out (`lift` 0..1),
 * lying in wait (`frozen`), holding on to something (`attached`).
 */
export function drawCaveSpider(ctx: CanvasRenderingContext2D, t: Terrain, ground: GroundColor, slot: number, pts: readonly number[], seed: number, lift: number, frozen: boolean, attached: boolean, now: number): void {
  const hx = pts[0];
  const hy = pts[1];
  const ax = pts[2] ?? hx - 4;
  const ay = pts[3] ?? hy;
  const cx = (hx + ax) / 2;
  const cy = (hy + ay) / 2;
  // Its frame: along the body (toward the head), and up off its ground.
  const up = openFrom(t, cx, cy);
  let tx = hx - ax;
  let ty = hy - ay;
  const tl = Math.hypot(tx, ty);
  if (tl < 0.01) {
    tx = -up.y;
    ty = up.x;
  } else {
    tx /= tl;
    ty /= tl;
  }
  let ux = up.x - tx * (up.x * tx + up.y * ty);
  let uy = up.y - ty * (up.x * tx + up.y * ty);
  const ul = Math.hypot(ux, uy);
  if (ul < 0.01) {
    ux = -ty;
    uy = tx;
    if (uy > 0) {
      ux = -ux;
      uy = -uy;
    }
  } else {
    ux /= ul;
    uy /= ul;
  }
  // Standing up on its legs; lying in wait, pressed flat to the rock.
  const sink = frozen ? 1.3 : -1.6;
  const bx = cx - ux * sink;
  const by = cy - uy * sink;
  const solid = (x: number, y: number) => t.isSolid(Math.floor(x), Math.floor(y));
  // The colour it takes on: the ground under it (else the rock's grey).
  let base: readonly number[] = ROCK[0];
  for (let k = 2; k < 12; k++) {
    const gx = bx - ux * k;
    const gy = by - uy * k;
    if (solid(gx, gy)) {
      base = rgbOf(ground(Math.floor(gx), Math.floor(gy)));
      break;
    }
  }
  const feet = spiderFeet(slot, seed, t, bx, by, tx, ty, ux, uy, lift, frozen, attached, now);
  // Legs (behind the body), the far ones (every other) darker.
  const hipAt = (j: number): [number, number] => [hx - ux * sink + tx * HIP[j] * 0.8 + ux * 0.6, hy - uy * sink + ty * HIP[j] * 0.8 + uy * 0.6];
  for (const far of [true, false]) {
    for (let j = 0; j < 8; j++) {
      if ((j % 2 === 1) !== far) continue;
      const [px, py] = hipAt(j);
      leg(ctx, px, py, feet.x[j], feet.y[j], ux, uy, base, far, seed, j);
    }
  }
  // The body: the abdomen (fat, behind), the head (smaller, ahead); a waist between.
  body(ctx, bx - tx * 3, by - ty * 3, tx, ty, ux, uy, 5.2, 4, base, seed, 1, !frozen);
  body(ctx, hx - ux * sink + tx * 0.8, hy - uy * sink + ty * 0.8, tx, ty, ux, uy, 3.3, 2.7, base, seed, 0, !frozen);
  gem(ctx, bx - tx * 3.4 + ux * 3.4, by - ty * 3.4 + uy * 3.4, tx, ty, ux, uy, seed, now);
  // Its face: fangs (out, dashing or leaping), feelers, and its eyes.
  const fx = hx - ux * sink + tx * 3.2;
  const fy = hy - uy * sink + ty * 3.2;
  const spread = lift;
  for (const s of [-1, 1]) {
    const len = 1.6 + spread * 2.2;
    const ox = fx + ux * s * (0.6 + spread * 0.9);
    const oy = fy + uy * s * (0.6 + spread * 0.9);
    // (Curved in at the tip: down and forward.)
    const ex = ox + tx * len - ux * s * spread * 0.8 - ux * 0.6;
    const ey = oy + ty * len - uy * s * spread * 0.8 - uy * 0.6;
    ctx.fillStyle = css(base, 0.45);
    line(ctx, ox, oy, (ox + ex) / 2, (oy + ey) / 2);
    ctx.fillStyle = spread > 0.3 ? FANG : css(base, 0.7);
    line(ctx, (ox + ex) / 2, (oy + ey) / 2, ex, ey);
  }
  // Feelers (the pedipalps): short, tipped forward, twitching while it hunts.
  if (!frozen) {
    const tw = Math.sin(now / 70 + seed) * 0.6;
    for (const s of [-1, 1]) {
      ctx.fillStyle = css(base, 0.6);
      const px = hx - ux * sink + tx * 2.6 + ux * (1.4 + s * 0.4);
      const py = hy - uy * sink + ty * 2.6 + uy * (1.4 + s * 0.4);
      line(ctx, px, py, px + tx * 2.2 + ux * (0.8 + tw * s), py + ty * 2.2 + uy * (0.8 + tw * s));
    }
  }
  // Eyes: two big ones up front, a crescent of small ones behind; dull still, catching the light red hunting.
  const ex = hx - ux * sink + tx * 1.6 + ux * 1.6;
  const ey = hy - uy * sink + ty * 1.6 + uy * 1.6;
  const glint = !frozen && Math.sin(now / 300 + seed) > -0.2;
  ctx.fillStyle = frozen ? css(base, 0.35) : '#1a0808';
  ctx.fillRect(Math.round(ex + tx), Math.round(ey + ty), 1, 1);
  ctx.fillRect(Math.round(ex + tx * 0.2 + ux * 0.6), Math.round(ey + ty * 0.2 + uy * 0.6), 1, 1);
  ctx.fillRect(Math.round(ex - tx * 0.8 + ux * 0.9), Math.round(ey - ty * 0.8 + uy * 0.9), 1, 1);
  if (glint) {
    ctx.fillStyle = '#ff3a2a';
    ctx.fillRect(Math.round(ex + tx), Math.round(ey + ty), 1, 1);
    ctx.fillStyle = '#ffb0a0';
    ctx.fillRect(Math.round(ex + tx * 0.2 + ux * 0.6), Math.round(ey + ty * 0.2 + uy * 0.6), 1, 1);
  }
}

/** Its one gem, by its seed: pink, turquoise or emerald (dark, mid, lit, glint), as the GEMMs in the ground are. */
const SPIDER_GEMS = [
  ['#8a0c46', '#ff2a8a', '#ff8ac4', '#ffe0f0'],
  ['#0a6a66', '#18c8c0', '#80fff0', '#e0fffc'],
  ['#0c5a2a', '#22b85a', '#90ffb0', '#e8fff0'],
];
/**
 * The one gem set into the top of its abdomen: a faceted crystal, a point
 * standing up off its back, its lit face toward its head, a dark outline,
 * glinting now and then. Lying in wait it's still there: just another
 * GEMM in the rock (a lure, as much as anything).
 */
function gem(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, ux: number, uy: number, seed: number, now: number): void {
  const g = SPIDER_GEMS[seed % 3];
  const R = 4;
  for (let py = Math.floor(y - R); py <= Math.ceil(y + R); py++) {
    for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const u = dx * tx + dy * ty;
      const v = dx * ux + dy * uy;
      // A diamond, taller than wide (pointing up off its back), its foot sunk in the hide.
      const e = Math.abs(u) / 2.6 + Math.max(v, -v * 1.6) / 3.3;
      if (e > 1 || v < -1.4) continue;
      let c: string;
      if (e > 0.8) c = OUTLINE;
      else if (u > 0.25) c = v > 0.6 ? g[2] : g[1];
      else if (u < -0.25) c = g[0];
      else c = g[1];
      ctx.fillStyle = c;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  // Its glint: now and then, a flash on the lit facet.
  const tw = Math.sin(now / 420 + seed * 1.7);
  if (tw > 0.7) {
    ctx.fillStyle = g[3];
    ctx.fillRect(Math.round(x + tx * 0.6 + ux * 1), Math.round(y + ty * 0.6 + uy * 1), 1, 1);
  }
}

/** A line of single cells. */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
}

/**
 * Part of its body (`part` 0: head, 1: abdomen), an egg of cells `len`
 * along and `w` across, rasterised cell by cell: the ground's colour,
 * lit along its back and shadowed under, mottled with the rock's greys and
 * grit; the abdomen with a dark folium (chevrons) down it, the head with a
 * ridge. `rim`: its outline (gone when it lies in wait).
 */
function body(ctx: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, ux: number, uy: number, len: number, w: number, base: readonly number[], seed: number, part: number, rim: boolean): void {
  const R = Math.ceil(Math.max(len, w)) + 1;
  for (let py = Math.floor(y - R); py <= Math.ceil(y + R); py++) {
    for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const u = dx * tx + dy * ty;
      const v = dx * ux + dy * uy;
      // (An egg: fuller at the back of the abdomen, a bumpy top.)
      const ww = w * (part === 1 ? 1 - 0.18 * (u / len) : 1) * (v > 0 ? 1 + 0.08 * Math.sin(u * 2.3 + seed) : 0.85);
      const e = (u / len) ** 2 + (v / ww) ** 2;
      if (e > 1) continue;
      const h = hsh(px, py, seed + part * 17);
      if (rim && e > 0.72) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(px, py, 1, 1);
        continue;
      }
      const top = v / ww;
      let k = top > 0.45 ? 1.18 : top > 0 ? 1.02 : top > -0.45 ? 0.86 : 0.7;
      let c: readonly number[] = base;
      // Mottled with the rock's own greys, in blotches.
      const blot = hsh(Math.floor((px + seed) / 2), Math.floor(py / 2), 41);
      if (blot < 0.22) c = ROCK[Math.floor(hsh(px >> 1, py >> 1, 43) * 3)];
      if (part === 1) {
        // The folium: a dark band down its back, chevrons across it.
        const chev = Math.abs(v - 0.6) < 1.1 && ((Math.floor(u + Math.abs(v - 0.6) * 0.8 + 20) % 3) + 3) % 3 === 0;
        if (chev && top > -0.2) k *= 0.62;
      } else if (Math.abs(v - w * 0.35) < 0.5 && top > 0) k *= 1.12; // (the head's ridge)
      if (h < 0.08) k *= 0.6; // (grit)
      else if (h > 0.95 && top > 0) k *= 1.3;
      ctx.fillStyle = css(c, k);
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

/**
 * One leg from its hip (hx, hy) to its foot (fx, fy): two-bone IK, the knee
 * bent up off the ground (the way `ux, uy` points); a thick thigh to a
 * knobbled knee, a thin shin banded at its joints, a dark claw at the foot.
 */
function leg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, ux: number, uy: number, base: readonly number[], far: boolean, seed: number, j: number): void {
  const dx = fx - hx;
  const dy = fy - hy;
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.05);
  const a = Math.atan2(dy, dx);
  const cosA = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d || 1);
  const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const k1x = hx + Math.cos(a - bend) * THIGH;
  const k1y = hy + Math.sin(a - bend) * THIGH;
  const k2x = hx + Math.cos(a + bend) * THIGH;
  const k2y = hy + Math.sin(a + bend) * THIGH;
  const [kx, ky] = (k1x - hx) * ux + (k1y - hy) * uy > (k2x - hx) * ux + (k2y - hy) * uy ? [k1x, k1y] : [k2x, k2y];
  const sh = far ? 0.55 : 0.85;
  // A dark edge under it all, so it reads against the rock.
  ctx.fillStyle = OUTLINE;
  line(ctx, hx - ux * 0.8, hy - uy * 0.8, kx - ux * 0.8, ky - uy * 0.8);
  line(ctx, kx - ux * 0.8, ky - uy * 0.8, fx - ux * 0.4, fy - uy * 0.4);
  // The thigh: two cells thick.
  ctx.fillStyle = css(base, sh * 0.8);
  line(ctx, hx, hy, kx, ky);
  ctx.fillStyle = css(base, sh);
  line(ctx, hx + ux * 0.7, hy + uy * 0.7, kx + ux * 0.5, ky + uy * 0.5);
  // The shin, banded: lighter rings at its joints (a third and two thirds down).
  ctx.fillStyle = css(base, sh * 0.85);
  line(ctx, kx, ky, fx, fy);
  ctx.fillStyle = css(base, sh * 1.35);
  for (const f of [0.33, 0.66]) ctx.fillRect(Math.round(kx + (fx - kx) * f), Math.round(ky + (fy - ky) * f), 1, 1);
  // Bristles off the shin, here and there.
  ctx.fillStyle = css(base, sh * 0.5);
  if (hsh(seed, j, 5) > 0.4) ctx.fillRect(Math.round(kx + (fx - kx) * 0.45 + ux), Math.round(ky + (fy - ky) * 0.45 + uy), 1, 1);
  // The knee: a knob; the claw.
  ctx.fillStyle = css(base, sh * 1.15);
  ctx.fillRect(Math.round(kx) - (far ? 0 : 1), Math.round(ky) - 1, far ? 1 : 2, 2);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
}

/**
 * Where its eight feet are this frame (world cells), planted on the rock:
 * each stays where it landed until the body has moved on far enough from
 * where it belongs (on the ground there, out along the body), then steps,
 * a quick lifted arc, in two alternating sets. In the air (leaping or
 * falling) they splay out ahead of it, the front ones reaching; lying in
 * wait they spread wide and flat.
 */
function spiderFeet(slot: number, seed: number, t: Terrain, cx: number, cy: number, tx: number, ty: number, ux: number, uy: number, lift: number, frozen: boolean, attached: boolean, now: number): { x: Float32Array; y: Float32Array } {
  let g = gaits.get(slot);
  if (!g || g.seed !== seed) {
    g = { seed, x: new Float32Array(8), y: new Float32Array(8), fx: new Float32Array(8), fy: new Float32Array(8), t: new Float32Array(8).fill(1), at: now, init: false };
    gaits.set(slot, g);
    if (gaits.size > 64) gaits.delete(gaits.keys().next().value!);
  }
  const dt = Math.min(0.1, Math.max(0, (now - g.at) / 1000));
  g.at = now;
  const solid = (x: number, y: number) => t.isSolid(Math.floor(x), Math.floor(y));
  const spread = frozen ? 1.15 : 1;
  const target = (j: number): [number, number] => {
    const r = REST[j] * spread;
    if (!attached) {
      // In the air: splayed, the front legs reaching ahead (further, leaping at prey).
      const reach = j >= 4 ? 2 + lift * 3 : -1;
      return [cx + tx * (r * 0.75 + reach) - ux * 3, cy + ty * (r * 0.75 + reach) - uy * 3];
    }
    // On the ground out along the body: down from there to it (or, inside it, up out of it).
    let px = cx + tx * r + ux * 3;
    let py = cy + ty * r + uy * 3;
    if (solid(px, py)) {
      for (let k = 0; k < 10 && solid(px, py); k++) {
        px += ux;
        py += uy;
      }
      return [px - ux * 0.5, py - uy * 0.5];
    }
    for (let k = 0; k < 14; k++) {
      if (solid(px - ux, py - uy)) return [px, py];
      px -= ux;
      py -= uy;
    }
    // (Nothing under it there: the foot hangs, a little in.)
    return [cx + tx * r * 0.7 - ux * 4, cy + ty * r * 0.7 - uy * 4];
  };
  const busy = [0, 0];
  for (let j = 0; j < 8; j++) if (g.t[j] < 1) busy[SET[j]]++;
  for (let j = 0; j < 8; j++) {
    const [gx, gy] = target(j);
    if (!g.init || !attached) {
      const k = g.init ? Math.min(1, dt * 18) : 1;
      g.x[j] += (gx - g.x[j]) * k;
      g.y[j] += (gy - g.y[j]) * k;
      if (!g.init) {
        g.x[j] = gx;
        g.y[j] = gy;
      }
      g.t[j] = 1;
      continue;
    }
    if (g.t[j] < 1) {
      g.t[j] = Math.min(1, g.t[j] + dt / STEP_TIME);
      const s = g.t[j];
      const e = s * s * (3 - 2 * s);
      const arc = Math.sin(Math.PI * s) * 2;
      g.x[j] = g.fx[j] + (gx - g.fx[j]) * e + ux * arc;
      g.y[j] = g.fy[j] + (gy - g.fy[j]) * e + uy * arc;
      continue;
    }
    const off = Math.hypot(g.x[j] - gx, g.y[j] - gy);
    if (off > 16) {
      g.x[j] = gx;
      g.y[j] = gy;
      continue;
    }
    if ((off > STRIDE && busy[1 - SET[j]] === 0) || off > STRIDE * 2.4) {
      g.fx[j] = g.x[j];
      g.fy[j] = g.y[j];
      g.t[j] = 0;
      busy[SET[j]]++;
    }
  }
  g.init = true;
  return { x: g.x, y: g.y };
}

/** A piece of a dead one, flung off whole: its head (`i` 0), its abdomen (1), or a leg (the rest). */
export function drawSpiderGib(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, seed: number, i: number): void {
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const base = ROCK[1];
  if (i < 2) {
    body(ctx, x, y, tx, ty, -ty, tx, i === 0 ? 2.9 : 4.4, i === 0 ? 2.4 : 3.4, base, seed, i, true);
    // Torn open: the wet inside showing at one end.
    ctx.fillStyle = '#6a8a3a';
    ctx.fillRect(Math.round(x - tx * (i === 0 ? 2 : 3.4)), Math.round(y - ty * (i === 0 ? 2 : 3.4)), 2, 2);
    return;
  }
  // A leg, bent at the knee.
  const kx = x + Math.cos(a) * 4;
  const ky = y + Math.sin(a) * 4;
  const b2 = a + 1.1 + hsh(seed, i, 3) * 0.6;
  ctx.fillStyle = css(base, 0.8);
  line(ctx, x, y, kx, ky);
  ctx.fillStyle = css(base, 0.6);
  line(ctx, kx, ky, kx + Math.cos(b2) * 6, ky + Math.sin(b2) * 6);
  ctx.fillStyle = css(base, 1.1);
  ctx.fillRect(Math.round(kx), Math.round(ky), 1, 1);
}
