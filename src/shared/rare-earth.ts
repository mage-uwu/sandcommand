import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat, isSoil } from './materials.ts';
import { Rng } from './rng.ts';

/**
 * Rare earth: small crystals scattered through the deep ground, a few cells
 * each (a core and two to four shards splaying out of it), worth ten times
 * their weight in gold. Only natural ground (soil and rock) takes them: never
 * a bunker, a ruin or a cave's air. Seeded and integer, like the rest of the
 * map, so every client grows the same ones.
 */

/** How many crystals a map grows. */
export const RARE_EARTH_CRYSTALS = 56;

const natural = (v: number) => v === Mat.Rock || isSoil(v);

/** Grow one crystal at (cx, cy) into `m`; returns the cells it took. */
export function growCrystal(m: Uint8Array, cx: number, cy: number, rng: Rng): number {
  let n = 0;
  const put = (x: number, y: number) => {
    if (x < 4 || y < 0 || x >= WORLD_W - 4 || y >= WORLD_H - 12) return;
    const i = y * WORLD_W + x;
    if (!natural(m[i])) return;
    m[i] = Mat.RareEarth;
    n++;
  };
  // The core: 3x3.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(cx + dx, cy + dy);
  // Shards: stubby prisms, two cells thick, splaying out of it in different directions.
  const shards = 2 + rng.int(3);
  const base = rng.next() * Math.PI * 2;
  for (let k = 0; k < shards; k++) {
    const a = base + (k / shards) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const len = 2 + rng.int(3);
    const ox = Math.abs(Math.sin(a)) > 0.5 ? 1 : 0;
    const oy = 1 - ox;
    for (let r = 2; r <= len + 1; r++) {
      const x = cx + Math.round(Math.cos(a) * r);
      const y = cy + Math.round(Math.sin(a) * r);
      put(x, y);
      if (r <= len) put(x + ox, y + oy);
    }
  }
  return n;
}

/** Scatter the map's crystals: deep under the surface, in natural ground. */
export function placeRareEarth(m: Uint8Array, heights: Int32Array, seed: number): void {
  const rng = new Rng(seed ^ 0x8e47ea);
  let placed = 0;
  for (let tries = 0; tries < RARE_EARTH_CRYSTALS * 12 && placed < RARE_EARTH_CRYSTALS; tries++) {
    const x = 40 + rng.int(WORLD_W - 80);
    const surf = heights[x];
    const room = WORLD_H - 30 - (surf + 70);
    if (room <= 0) continue;
    // Deeper is likelier (the square of a uniform draw, from the bottom).
    const u = rng.next();
    const y = WORLD_H - 30 - Math.floor(u * u * room);
    if (!natural(m[y * WORLD_W + x])) continue;
    if (growCrystal(m, x, y, rng) >= 4) placed++;
  }
}
