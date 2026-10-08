import { ACTOR_H, WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng } from './rng.ts';

/**
 * Bunker complexes on the surface, built on a modular grid as part of map
 * generation (so clients build the identical structures from the seed).
 *
 * A complex is a row of modules (MOD_W x MOD_H cells) standing on a levelled
 * concrete foundation: rooms at ground level, some modules rising into
 * towers, basements below. Neighbouring rooms connect through doorways,
 * storeys through holes in the floor slabs (jetpack up, drop down), and the
 * ends have doors to the outside. Some basements run an escape tunnel out
 * under the open ground that climbs to a hatch on the surface; some modules
 * are already shot up.
 *
 * Between 15% and 60% of the surface (random per map) is built on; the rest
 * is open ground. Everything is concrete and metal plate, so only explosion
 * cores and diggers get through. Integer arithmetic and the seeded Rng only,
 * so every engine builds the same thing.
 */
export const MOD_W = 32;
export const MOD_H = 24;
const WALL = 3; // wall thickness
const SLAB = 3; // floor / ceiling thickness
const DOOR_H = ACTOR_H + 3; // doorways a clone walks through
const HOLE_W = 12; // floor holes and shafts a clone can jet through
const MARGIN = 96; // keep clear of the world's edge walls
const MAX_FOUNDATION = 90;

export interface Complex {
  x0: number; // footprint, cells
  x1: number;
  floor: number; // ground-floor standing surface (y)
  heights: number[]; // storeys above ground per module
  basements: number[]; // storeys below ground per module
}

/**
 * Build bunker complexes into `m` (a raw material grid, WORLD_W x WORLD_H)
 * along the surface `heights`. Returns the complexes for tests and spawning.
 */
export function placeStructures(m: Uint8Array, heights: Int32Array, seed: number): Complex[] {
  const rng = new Rng(seed ^ 0xb0b5);
  const coverage = 0.15 + rng.next() * 0.45;
  const nMods = Math.floor((WORLD_W - 2 * MARGIN) / MOD_W);
  const target = Math.round(nMods * coverage);
  const complexes = Math.max(1, Math.round(target / 4.5));
  const meanGap = Math.max(1, (nMods - target) / (complexes + 1));
  const out: Complex[] = [];
  let i = 1 + rng.int(Math.ceil(meanGap));
  let built = 0;
  while (built < target && i < nMods - 1) {
    let len = Math.min(target - built, 2 + rng.int(6), nMods - 1 - i);
    if (len < 1) break;
    if (len === 1 && target - built > 1) len = 2;
    const x0 = MARGIN + i * MOD_W;
    const c = buildComplex(m, heights, x0, len, rng);
    if (c) out.push(c);
    built += len;
    i += len + 1 + rng.int(Math.max(1, Math.round(meanGap * 2 - 1)));
  }
  // Escape tunnels from end basements, out under the open ground beside them.
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (rng.next() > 0.45) continue;
    const right = rng.next() < 0.5;
    const end = right ? c.basements.length - 1 : 0;
    if (c.basements[end] === 0) continue;
    const limit = right ? (out[k + 1]?.x0 ?? WORLD_W - MARGIN) - 24 : (out[k - 1]?.x1 ?? MARGIN) + 24;
    tunnel(m, heights, c, right, limit, rng);
  }
  return out;
}

function fill(m: Uint8Array, x0: number, y0: number, x1: number, y1: number, mat: number): void {
  const xa = Math.max(4, x0);
  const xb = Math.min(WORLD_W - 4, x1);
  const ya = Math.max(0, y0);
  const yb = Math.min(WORLD_H - 12, y1);
  for (let y = ya; y < yb; y++) m.fill(mat, y * WORLD_W + xa, y * WORLD_W + xb);
}

function buildComplex(m: Uint8Array, heights: Int32Array, x0: number, len: number, rng: Rng): Complex | null {
  const x1 = x0 + len * MOD_W;
  // Level the site at the median ground height under it (snapped to 4).
  const hs: number[] = [];
  for (let x = x0; x < x1; x += 4) hs.push(heights[x]);
  hs.sort((a, b) => a - b);
  const floor = (hs[hs.length >> 1] >> 2) << 2;
  const storeys: number[] = [];
  const basements: number[] = [];
  for (let k = 0; k < len; k++) {
    storeys.push([1, 1, 1, 1, 2, 2, 3][rng.int(7)]);
    basements.push([0, 0, 1, 1, 1, 2][rng.int(6)]);
  }
  const deepest = Math.max(...basements);
  if (floor - 3 * MOD_H < 8 || floor + SLAB + deepest * MOD_H > WORLD_H - 40) return null;

  // Site: clear the ground above the floor (a notch where the hill rises),
  // pour the floor slab, and fill any dip beneath it down to solid ground.
  const top = floor - Math.max(...storeys) * MOD_H;
  fill(m, x0 - 2, top - 6, x1 + 2, floor, Mat.Air);
  fill(m, x0, floor, x1, floor + SLAB, Mat.Concrete);
  for (let x = x0; x < x1; x++) {
    for (let y = floor + SLAB, n = 0; y < WORLD_H - 12 && n < MAX_FOUNDATION; y++, n++) {
      if (m[y * WORLD_W + x] !== Mat.Air) break;
      m[y * WORLD_W + x] = Mat.Concrete;
    }
  }

  // Storeys above ground: ceilings (metal on top), then walls on each module
  // boundary as tall as the taller side.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    for (let lv = 0; lv < storeys[k]; lv++) {
      const yTop = floor - (lv + 1) * MOD_H;
      fill(m, mx, yTop, mx + MOD_W, yTop + SLAB, lv === storeys[k] - 1 ? Mat.Metal : Mat.Concrete);
    }
  }
  for (let b = 0; b <= len; b++) {
    const bx = b === len ? x1 - WALL : x0 + b * MOD_W;
    const left = b > 0 ? storeys[b - 1] : 0;
    const right = b < len ? storeys[b] : 0;
    const h = Math.max(left, right);
    fill(m, bx, floor - h * MOD_H, bx + WALL, floor, Mat.Concrete);
    for (let lv = 0; lv < h; lv++) {
      const yFloor = floor - lv * MOD_H; // standing surface of this storey
      const inside = lv < Math.min(left, right);
      if (inside) {
        // Rooms on both sides: a doorway (always at ground level).
        if (lv === 0 || rng.next() < 0.6) fill(m, bx, yFloor - DOOR_H, bx + WALL, yFloor, Mat.Air);
      } else if (lv === 0) {
        // An end of the complex: the way in (most ends have one).
        if (rng.next() < 0.8 || (b === 0 && len === 1)) fill(m, bx, yFloor - DOOR_H, bx + WALL, yFloor, Mat.Air);
      } else if (rng.next() < 0.6) {
        // An upper storey looking out over a lower roof: a firing slit at head height.
        fill(m, bx, yFloor - 12, bx + WALL, yFloor - 9, Mat.Air);
      }
    }
  }
  // Hollow out the rooms, and cut holes between storeys.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    const ix0 = mx + WALL;
    const ix1 = k === len - 1 ? x1 - WALL : mx + MOD_W;
    for (let lv = 0; lv < storeys[k]; lv++) {
      const yTop = floor - (lv + 1) * MOD_H;
      fill(m, ix0, yTop + SLAB, ix1, floor - lv * MOD_H, Mat.Air);
      if (lv > 0) {
        const hx = ix0 + 2 + rng.int(Math.max(1, ix1 - ix0 - HOLE_W - 4));
        fill(m, hx, yTop + MOD_H, hx + HOLE_W, yTop + MOD_H + SLAB, Mat.Air);
      }
    }
  }

  // Basements: concrete boxes with the rooms carved out, shafts from the
  // storey above, doorways to neighbouring basements.
  for (let k = 0; k < len; k++) {
    const mx = x0 + k * MOD_W;
    for (let j = 0; j < basements[k]; j++) {
      const by0 = floor + SLAB + j * MOD_H;
      const by1 = by0 + MOD_H;
      fill(m, mx, by0, mx + MOD_W, by1, Mat.Concrete);
      fill(m, mx + WALL, by0 + (j > 0 ? SLAB : 0), mx + MOD_W - WALL, by1 - SLAB, Mat.Air);
      // Shaft down from the room above (the ground floor, or the basement above).
      const sx = mx + WALL + 2 + rng.int(MOD_W - 2 * WALL - HOLE_W - 4);
      fill(m, sx, by0 - SLAB - (j > 0 ? SLAB : 0), sx + HOLE_W, by0 + SLAB, Mat.Air);
    }
    for (let j = 0; j < basements[k] && k > 0; j++) {
      if (j >= basements[k - 1]) continue;
      const fy = floor + SLAB + (j + 1) * MOD_H - SLAB; // basement floor surface
      fill(m, mx - WALL, fy - DOOR_H, mx + WALL, fy, Mat.Air);
    }
  }

  // Battle damage: some modules come pre-shot.
  for (let k = 0; k < len; k++) {
    if (rng.next() > 0.22) continue;
    const mx = x0 + k * MOD_W;
    const holes = 2 + rng.int(4);
    for (let n = 0; n < holes; n++) {
      const cx = mx + rng.int(MOD_W);
      const cy = floor - rng.int(storeys[k] * MOD_H);
      const r = 3 + rng.int(5);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 4 || x >= WORLD_W - 4 || y < 0 || y >= WORLD_H - 12) continue;
          const v = m[y * WORLD_W + x];
          if (v === Mat.Concrete || v === Mat.Metal) m[y * WORLD_W + x] = Mat.Air;
        }
      }
    }
  }
  return { x0, x1, floor, heights: storeys, basements };
}

/**
 * A lined escape tunnel from the end basement out under the open ground,
 * climbing to a hatch on the surface.
 */
function tunnel(m: Uint8Array, heights: Int32Array, c: Complex, right: boolean, limit: number, rng: Rng): void {
  const floorY = c.floor + SLAB + MOD_H - SLAB; // basement floor surface
  const ty = floorY - DOOR_H;
  const start = right ? c.x1 - WALL : c.x0 + WALL;
  const want = 64 + rng.int(180);
  const end = right ? Math.min(start + want, limit) : Math.max(start - want, limit);
  if (Math.abs(end - start) < 40) return;
  const xa = Math.min(start, end);
  const xb = Math.max(start, end);
  fill(m, xa, ty - 2, xb, floorY + 2, Mat.Concrete);
  fill(m, xa, ty, xb, floorY, Mat.Air);
  // Up to the surface at the far end.
  const sx = right ? end - HOLE_W - 2 : end + 2;
  const surface = Math.min(heights[sx], heights[sx + HOLE_W]);
  if (surface >= ty - 4) return;
  fill(m, sx - 2, surface - 2, sx + HOLE_W + 2, ty, Mat.Concrete);
  fill(m, sx, surface - 2, sx + HOLE_W, ty + 2, Mat.Air);
}
