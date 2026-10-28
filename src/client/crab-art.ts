import type { Terrain } from '../shared/terrain.ts';
import { openWay } from '../shared/wildlife.ts';

/**
 * The coral crab, in pixels (one terrain cell to a pixel): a squat,
 * spiderlike thing about half a cave spider's size, its shell crusted over
 * in patches of coral (pink, teal and emerald, like the GEMMs) and studded with gem chips that glint like
 * the GEMM crystals it passes for at rest (drawn then by drawAspGem). Eight
 * thin jointed legs scurry under it; two hooked claws reach out front. On
 * a clone (`latched`) it's pressed tight, legs clamped round, claws working.
 */

/** A fixed hash in [0, 1) of a few integers. */
const hsh = (a: number, b: number, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Its coral crust: dark, mid, light, tip. */
const CORAL = ['#5a1a2c', '#c0405a', '#ff7a8a', '#ffd0c0'];
/** The hive's corals (dark, mid, light, tip): pink, teal and emerald, like the GEMMs. */
const CORALS = [CORAL, ['#08302c', '#1aa898', '#5ae0cc', '#c8fff4'], ['#0c2e14', '#1e9a48', '#5ad87a', '#d0ffd8']];
/** Its gem chips (pink, turquoise, emerald), each a lit face and a dark one. */
const CHIPS = [
  ['#ff9ad8', '#a0306a'],
  ['#7af0f0', '#1a8090'],
  ['#8af08a', '#1a7a3a'],
];
const LEG = '#9a3a52';
const KNEE = '#e8708a';
const CLAW = '#ffb0a0';

/** One cell at (x, y). */
const dot = (ctx: CanvasRenderingContext2D, x: number, y: number) => ctx.fillRect(Math.round(x), Math.round(y), 1, 1);

/** A line of cells from (x0, y0) to (x1, y1). */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) dot(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}

/**
 * A coral crab awake, from its body points (head, rear): scurrying, lunging
 * (`lift` up off the ground, legs splayed) or `latched` onto someone.
 */
export function drawCoralCrab(ctx: CanvasRenderingContext2D, t: Terrain, pts: readonly number[], seed: number, lift: number, latched: boolean, now: number): void {
  const hx = pts[0];
  const hy = pts[1];
  const ax = pts[2] ?? hx - 2;
  const ay = pts[3] ?? hy;
  const cx = (hx + ax) / 2;
  const cy = (hy + ay) / 2;
  // Its frame: forward (toward the head) and up (out of the rock; on a clone, just up).
  let fx = hx - ax;
  let fy = hy - ay;
  const fl = Math.hypot(fx, fy);
  if (fl < 0.01) {
    fx = 1;
    fy = 0;
  } else {
    fx /= fl;
    fy /= fl;
  }
  const open = latched ? { x: 0, y: -1 } : openWay(t, cx, cy);
  let ux = open.x - fx * (open.x * fx + open.y * fy);
  let uy = open.y - fy * (open.x * fx + open.y * fy);
  const ul = Math.hypot(ux, uy);
  if (ul < 0.01) {
    ux = -fy;
    uy = fx;
    if (uy > 0) {
      ux = -ux;
      uy = -uy;
    }
  } else {
    ux /= ul;
    uy /= ul;
  }
  const at = (f: number, u: number): [number, number] => [cx + fx * f + ux * u, cy + fy * f + uy * u];
  const air = !latched && lift > 0.3;
  const step = latched ? Math.sin(now / 40 + seed) : Math.sin(now / 55 + seed * 3);

  // Legs: four a side, thin and jointed, knees high; scurrying in a ripple, splayed in the air, clamped on a clone.
  ctx.fillStyle = LEG;
  for (let i = 0; i < 4; i++) {
    const root = -1.5 + i;
    const ph = step * (i % 2 ? 1 : -1);
    for (const side of [-1, 1]) {
      const reach = side * (2.2 + i * 0.6) + (air ? side * 1.5 : 0);
      const [x0, y0] = at(root * 0.8, 0.5);
      const [kx, ky] = at(root * 0.8 + reach * 0.6, air ? 1.2 : 2.2);
      const down = latched ? -1.5 : air ? -0.5 : -2.4;
      const [x1, y1] = at(root * 0.8 + reach + ph * (air ? 0 : 0.9), down);
      ctx.fillStyle = LEG;
      line(ctx, x0, y0, kx, ky);
      line(ctx, kx, ky, x1, y1);
      ctx.fillStyle = KNEE;
      dot(ctx, kx, ky);
    }
  }

  // Claws, out front: hooked, opening and snapping shut.
  const snap = latched ? (Math.floor(now / 90 + seed) % 2) * 0.8 : 0.4 + 0.3 * Math.sin(now / 160 + seed);
  ctx.fillStyle = CLAW;
  for (const s of [-1, 1]) {
    const [x0, y0] = at(2.4, 0.5 + s * 0.6);
    const [x1, y1] = at(4.4, 0.6 + s * (1.2 + snap));
    line(ctx, x0, y0, x1, y1);
    const [x2, y2] = at(5, 0.6 + s * (0.6 + snap * 0.5));
    dot(ctx, x2, y2);
  }

  // The shell: a low dome, crusted in coral, lit along its top; the coral in patches of pink, teal and emerald.
  for (let f = -3; f <= 3; f++) {
    const hgt = f === -3 || f === 3 ? 2 : f === -2 || f === 2 ? 3 : 4;
    for (let u = -1; u < hgt; u++) {
      const top = u === hgt - 1;
      const n = hsh(seed, f + 7, u);
      const C = CORALS[Math.floor(hsh(seed, (f + 3) >> 1, (u + 1) >> 1) * 3)];
      ctx.fillStyle = top ? (n < 0.3 ? C[3] : C[2]) : u <= 0 ? C[0] : n < 0.5 ? C[1] : C[2];
      const [x, y] = at(f, u);
      dot(ctx, x, y);
    }
  }
  // Coral polyps standing off its back: little branched knobs, a few to each crab.
  const knobs = 2 + Math.floor(hsh(seed, 1, 9) * 3);
  for (let k = 0; k < knobs; k++) {
    const f = -2.5 + hsh(seed, k, 11) * 5;
    const tall = 1 + Math.floor(hsh(seed, k, 12) * 2);
    const pc = CORALS[Math.floor(hsh(seed, k, 13) * 3)];
    ctx.fillStyle = pc[1];
    for (let u = 4; u < 4 + tall; u++) {
      const [x, y] = at(f, u);
      dot(ctx, x, y);
    }
    ctx.fillStyle = pc[3];
    const [x, y] = at(f, 4 + tall);
    dot(ctx, x, y);
  }
  // Gem chips set in the crust, glinting now and then (as the crystals in the rock do).
  const chips = 2 + Math.floor(hsh(seed, 2, 9) * 2);
  for (let k = 0; k < chips; k++) {
    const [lit, dark] = CHIPS[Math.floor(hsh(seed, k, 21) * 3)];
    const f = Math.round(-2 + hsh(seed, k, 22) * 4);
    const u = 1 + Math.floor(hsh(seed, k, 23) * 2);
    const glint = Math.floor(now / 120 + k * 13 + seed) % 23 === 0;
    ctx.fillStyle = glint ? '#ffffff' : lit;
    const [x, y] = at(f, u);
    dot(ctx, x, y);
    ctx.fillStyle = dark;
    const [x2, y2] = at(f + 1, u - 1);
    dot(ctx, x2, y2);
  }
  // Its eyes: two tiny black beads on stalks at the front, a glint of red in them.
  for (const s of [0, 1]) {
    ctx.fillStyle = '#1a0a10';
    const [x, y] = at(2.6, 2 + s);
    dot(ctx, x, y);
  }
  ctx.fillStyle = '#ff3050';
  const [ex, ey] = at(3.2, 2.6);
  dot(ctx, ex, ey);
}

/**
 * A crab nest (Infection's hive): a coral nest (drawn first, drawNest) gone
 * to crystal, gem shards jutting out all over its papery coral, and at its
 * mouth, now and then, a crab's leg feeling its way out.
 */
export function drawCrabNestCrystals(ctx: CanvasRenderingContext2D, t: Terrain, x: number, y: number, seed: number, now: number): void {
  const open = openWay(t, x, y);
  const shards = 6;
  for (let k = 0; k < shards; k++) {
    const a = Math.atan2(open.y, open.x) + (k - (shards - 1) / 2) * 0.55 + (hsh(seed, k, 31) - 0.5) * 0.3;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const [lit, dark] = CHIPS[(seed + k) % 3];
    const base = 3 + hsh(seed, k, 32) * 2;
    const len = 3 + Math.floor(hsh(seed, k, 33) * 4);
    for (let d = 0; d < len; d++) {
      const glint = d === len - 1 && Math.floor(now / 140 + k * 11 + seed) % 17 === 0;
      ctx.fillStyle = glint ? '#ffffff' : d === len - 1 ? lit : d % 2 ? dark : lit;
      dot(ctx, x + c * (base + d), y + sn * (base + d));
      if (d < len - 2) {
        ctx.fillStyle = dark;
        dot(ctx, x + c * (base + d) - sn, y + sn * (base + d) + c);
      }
    }
  }
  // A leg out of its mouth, feeling about.
  if (Math.sin(now / 400 + seed) > 0.4) {
    ctx.fillStyle = LEG;
    const mx = x + open.x * 7;
    const my = y + open.y * 7;
    const w = Math.sin(now / 90 + seed) * 2;
    line(ctx, mx, my, mx + open.x * 3 - open.y * w, my + open.y * 3 + open.x * w);
    ctx.fillStyle = KNEE;
    dot(ctx, mx + open.x * 3 - open.y * w, my + open.y * 3 + open.x * w);
  }
}

/**
 * A creature infected by the coral (drawn over it, from its body points; `r`
 * its body's radius): the hive's crust on every segment in one strain or
 * another (pink, teal, emerald), a spine of it out of every other segment,
 * dead stalk to live tip, its eye a coral glow and the crab's blue blood
 * drooling from its jaws.
 */
export function drawInfection(ctx: CanvasRenderingContext2D, pts: readonly number[], seed: number, r: number, now: number): void {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const C = CORALS[(seed + i * 7) % CORALS.length];
    // Crust, clumped over the segment.
    const count = 2 + Math.floor(r * 1.2);
    for (let j = 0; j < count; j++) {
      const a = hsh(seed, i, j) * Math.PI * 2;
      const d = hsh(seed, i, j + 40) * r * 0.8;
      const h = hsh(seed, i, j + 80);
      ctx.fillStyle = h < 0.35 ? C[0] : h < 0.75 ? C[1] : h < 0.93 ? C[2] : C[3];
      dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    // A spine out of its back (every other segment): dead stalk, live tip.
    if (i % 2 === 1) {
      const len = 2 + Math.floor(hsh(seed, i, 7) * (2 + r * 0.5));
      const lean = hsh(seed, i, 8) < 0.5 ? -1 : 1;
      for (let k = 1; k <= len; k++) {
        ctx.fillStyle = k === len ? C[3] : k === len - 1 ? C[2] : '#341c28';
        dot(ctx, x + (k > len / 2 ? lean : 0), y - r + 1 - k);
      }
    }
  }
  if (!n) return;
  // Its eye: a coral glow, pulsing. Its jaws: drooling blue.
  const hx = pts[0];
  const hy = pts[1];
  ctx.fillStyle = Math.sin(now / 180 + seed) > 0 ? '#ff5a8a' : '#ffd0e0';
  dot(ctx, hx, hy - Math.max(1, r * 0.5));
  const ph = (now / 90 + seed * 13) % 10;
  if (ph < 7) {
    ctx.fillStyle = '#0b4f78';
    dot(ctx, hx, hy + Math.max(1, r * 0.6));
    ctx.fillStyle = '#18c8ff';
    dot(ctx, hx, hy + Math.max(1, r * 0.6) + 1 + Math.floor(ph / 2));
  }
}
