import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import type { Terrain } from './terrain.ts';

/**
 * Standing water: a body is a volume of water (cells) let into the ground
 * at a seed point. Where it stands is found, not simulated: the open air
 * connected to the seed below a level, the level being the highest at which
 * that region holds no more than the volume (a flood from the seed, capped,
 * binary-searched on the level). Dig into a cistern's side below the
 * waterline and the same volume spreads into the new space, the level
 * dropping; fill it in and it rises. The server solves the levels; clients
 * paint the same region from the level it sends (paintWater). Both repaint
 * every WATER_TICKS server ticks (on the same tick, from the same ground),
 * so debris settling in it or a cave-in leaves them in step.
 */
export interface WaterBody {
  /** The seed: an open cell at the bottom of the basin. */
  x: number;
  y: number;
  /** How many cells of water there are. */
  volume: number;
  /** The surface: the highest row under water (solveLevel). */
  level: number;
}

/** How often (server ticks) the water is re-solved and repainted, on both sides. */
export const WATER_TICKS = 15;

/** How far above its seed a body's surface may stand (a cap on the search). */
const MAX_RISE = 400;

// Scratch for the flood: a stamp per cell and a queue.
let stamp = new Uint16Array(0);
let stampN = 0;
const queue: number[] = [];

function nextStamp(): number {
  if (stamp.length !== WORLD_W * WORLD_H) stamp = new Uint16Array(WORLD_W * WORLD_H);
  stampN = (stampN + 1) & 0xffff;
  if (stampN === 0) {
    stamp.fill(0);
    stampN = 1;
  }
  return stampN;
}

/**
 * The open cells connected to (x, y) at or below row `level` (4-connected),
 * up to `cap` of them; `paint`, if given, marks each one 1. Returns how
 * many (cap + 1 when there are more).
 */
export function floodWater(t: Terrain, x: number, y: number, level: number, cap: number, paint?: Uint8Array): number {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H || t.mat[y * WORLD_W + x] !== Mat.Air || y < level) return 0;
  const s = nextStamp();
  queue.length = 0;
  const start = y * WORLD_W + x;
  stamp[start] = s;
  queue.push(start);
  let n = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (++n > cap) return cap + 1;
    const cx = i % WORLD_W;
    const cy = (i - cx) / WORLD_W;
    if (paint) {
      paint[i] = 1;
      if (cx < box.x0) box.x0 = cx;
      if (cx > box.x1) box.x1 = cx;
      if (cy < box.y0) box.y0 = cy;
      if (cy > box.y1) box.y1 = cy;
    }
    const visit = (j: number, ny: number) => {
      if (ny < level || stamp[j] === s || t.mat[j] !== Mat.Air) return;
      stamp[j] = s;
      queue.push(j);
    };
    if (cx > 0) visit(i - 1, cy);
    if (cx < WORLD_W - 1) visit(i + 1, cy);
    if (cy > 0) visit(i - WORLD_W, cy - 1);
    if (cy < WORLD_H - 1) visit(i + WORLD_W, cy + 1);
  }
  return n;
}

/** The seed's open cell: the body's own, or (if that's been filled in) the nearest open one just above it. */
function seedOf(t: Terrain, b: WaterBody): { x: number; y: number } | null {
  for (let dy = 0; dy < 24; dy++) if (t.get(b.x, b.y - dy) === Mat.Air) return { x: b.x, y: b.y - dy };
  return null;
}

/** Where the body's surface stands now (the highest level whose region holds no more than its volume). */
export function solveLevel(t: Terrain, b: WaterBody): number {
  const sd = seedOf(t, b);
  if (!sd) return b.y + 1; // (buried: no water)
  let lo = Math.max(0, sd.y - MAX_RISE); // (too high: too many cells)
  let hi = sd.y; // (just the bottom row: fits, or the least it can be)
  if (floodWater(t, sd.x, sd.y, hi, b.volume) > b.volume) return hi;
  if (floodWater(t, sd.x, sd.y, lo, b.volume) <= b.volume) return lo;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (floodWater(t, sd.x, sd.y, mid, b.volume) <= b.volume) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Paint every body into the terrain's water mask (at its level), marking
 * the chunks it covers (and covered) dirty for redrawing. Only the water's
 * box is touched, not the whole map.
 */
export function paintWater(t: Terrain, bodies: readonly WaterBody[]): void {
  const old = t.waterBox;
  if (!bodies.length) {
    if (old) t.markDirtyRect(old.x0, old.y0, old.x1, old.y1);
    t.water = null;
    t.waterBox = null;
    return;
  }
  const mask = t.water ?? new Uint8Array(WORLD_W * WORLD_H);
  if (old) for (let y = old.y0; y <= old.y1; y++) mask.fill(0, y * WORLD_W + old.x0, y * WORLD_W + old.x1 + 1);
  box.x0 = WORLD_W;
  box.y0 = WORLD_H;
  box.x1 = -1;
  box.y1 = -1;
  for (const b of bodies) {
    const sd = seedOf(t, b);
    if (sd) floodWater(t, sd.x, sd.y, b.level, b.volume * 2 + 64, mask);
  }
  const now = box.x1 >= 0 ? { ...box } : null;
  t.water = mask;
  t.waterBox = now;
  const u = old && now ? { x0: Math.min(old.x0, now.x0), y0: Math.min(old.y0, now.y0), x1: Math.max(old.x1, now.x1), y1: Math.max(old.y1, now.y1) } : (old ?? now);
  if (u) t.markDirtyRect(u.x0, u.y0, u.x1, u.y1);
}

/** The box of the cells the last painting flood marked. */
const box = { x0: 0, y0: 0, x1: 0, y1: 0 };
