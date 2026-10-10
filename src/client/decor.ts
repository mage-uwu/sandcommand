import { Mat } from '../shared/materials.ts';
import { Rng } from '../shared/rng.ts';
import { type Complex, MOD_H, MOD_W, SLAB, WALL } from '../shared/structures.ts';
import type { Terrain } from '../shared/terrain.ts';

/**
 * Fittings in the bunkers' rooms, purely for looks (client side, from the
 * map as generated: no gameplay, no network). Everything is on the back
 * wall or hangs from the ceiling, never on the floor, so nothing looks like
 * cover that isn't:
 *
 * - **lamp**: a caged lamp on a cord from the ceiling, casting a warm pool
 *   of light (it goes out with the ceiling it hangs from);
 * - **pipes**: a run of pipe under the ceiling, flanged, with a valve wheel;
 * - **cable**: a sagging cable slung between two hooks;
 * - **vent**: a slatted grille;
 * - **fusebox**: a grey cabinet with a few telltales winking;
 * - **poster**: a faded poster (a ringed planet, a clone saluting, "keep
 *   out" in red);
 * - **rack**: a wall rack of rifle outlines;
 * - **gauge**: a round dial;
 * - **stencil**: a stencilled level marker (L1, B2), or VAULT over a
 *   strongroom, with hazard stripes;
 * - **banner**: a fortress's team banner, hanging in its rooms.
 */
export const DecorKind = {
  Lamp: 0,
  Pipes: 1,
  Cable: 2,
  Vent: 3,
  Fusebox: 4,
  Poster: 5,
  Rack: 6,
  Gauge: 7,
  Stencil: 8,
  Banner: 9,
} as const;

export interface Decor {
  kind: number;
  /** Top-left and size (world cells). */
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  /** Stencils: the text. */
  text?: string;
  /** Banners: the team (0 red, 1 green). */
  team?: number;
}

/** Sizes of the wall pieces (cells). */
const WALL_PIECES: readonly [number, number, number][] = [
  [DecorKind.Vent, 10, 7],
  [DecorKind.Fusebox, 7, 10],
  [DecorKind.Poster, 9, 12],
  [DecorKind.Rack, 16, 9],
  [DecorKind.Gauge, 7, 7],
];

/** Every cell of the box air? */
function clear(t: Terrain, x0: number, y0: number, w: number, h: number): boolean {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (t.get(x, y) !== Mat.Air) return false;
  return true;
}

/** The fittings of every room of every complex (deterministic from the seed and the map as generated). */
export function placeDecor(t: Terrain, complexes: readonly Complex[], seed: number): Decor[] {
  const rng = new Rng(seed ^ 0xdec0);
  const out: Decor[] = [];
  for (const c of complexes) {
    const len = c.heights.length;
    const room = (x0: number, x1: number, top: number, floor: number, label: string) => furnish(t, rng, out, x0, x1, top, floor, label, c.fortress?.team);
    if (c.tower) {
      for (let lv = 0; lv < c.heights[0]; lv++) {
        const yTop = c.floor - (lv + 1) * MOD_H;
        room(c.x0 + WALL, c.x1 - WALL, yTop + SLAB, c.floor - lv * MOD_H, '');
      }
      continue;
    }
    for (let k = 0; k < len; k++) {
      const mx = c.x0 + k * MOD_W;
      const x0 = mx + WALL;
      const x1 = k === len - 1 ? c.x1 - WALL : mx + MOD_W;
      for (let lv = 0; lv < c.heights[k]; lv++) {
        const yTop = c.floor - (lv + 1) * MOD_H;
        room(x0, x1, yTop + SLAB, c.floor - lv * MOD_H, `L${lv + 1}`);
      }
      for (let j = 0; j < c.basements[k]; j++) {
        const by0 = c.floor + SLAB + j * MOD_H;
        room(x0, mx + MOD_W - WALL, by0 + (j > 0 ? SLAB : 0), by0 + MOD_H - SLAB, `B${j + 1}`);
      }
    }
    const s = c.strongroom;
    if (s) {
      // The strongroom: lamps down its length, and its name over the door side.
      for (let x = s.x0 + 20; x < s.x1 - 20; x += 44) lamp(t, out, x, s.y0, rng);
      const sy = s.y0 + 10;
      if (clear(t, ((s.x0 + s.x1) >> 1) - 12, sy, 24, 9)) out.push({ kind: DecorKind.Stencil, x: ((s.x0 + s.x1) >> 1) - 12, y: sy, w: 24, h: 9, seed: rng.int(1 << 20), text: 'VAULT' });
    }
  }
  return out;
}

/** A lamp hanging from the ceiling at (x, ceil), if there's ceiling there. */
function lamp(t: Terrain, out: Decor[], x: number, ceil: number, rng: Rng): void {
  if (t.get(x, ceil - 1) === Mat.Air || t.get(x, ceil) !== Mat.Air) return;
  const cord = 3 + rng.int(6);
  out.push({ kind: DecorKind.Lamp, x: x - 3, y: ceil, w: 7, h: cord + 5, seed: rng.int(1 << 20) });
}

/** Fit out one room: [x0, x1) wide, from its ceiling `top` down to its floor. */
function furnish(t: Terrain, rng: Rng, out: Decor[], x0: number, x1: number, top: number, floor: number, label: string, team: number | undefined): void {
  const w = x1 - x0;
  if (w < 30 || floor - top < 24) return;
  // A lamp or two.
  if (rng.next() < 0.85) lamp(t, out, x0 + 10 + rng.int(w - 20), top, rng);
  if (w > 50 && rng.next() < 0.3) lamp(t, out, x0 + 10 + rng.int(w - 20), top, rng);
  // Pipes along the ceiling, or a cable slung across.
  const services = rng.next();
  if (services < 0.35) {
    const px0 = x0 + rng.int(8);
    const px1 = x1 - rng.int(8);
    if (clear(t, px0, top + 1, px1 - px0, 4)) out.push({ kind: DecorKind.Pipes, x: px0, y: top + 1, w: px1 - px0, h: 4, seed: rng.int(1 << 20) });
  } else if (services < 0.6) {
    const cx0 = x0 + 2 + rng.int(10);
    const cx1 = x1 - 2 - rng.int(10);
    if (clear(t, cx0, top + 2, cx1 - cx0, 8)) out.push({ kind: DecorKind.Cable, x: cx0, y: top + 2, w: cx1 - cx0, h: 8, seed: rng.int(1 << 20) });
  }
  // Something on the wall at chest height.
  const pieces = 1 + (rng.next() < 0.4 ? 1 : 0);
  for (let n = 0; n < pieces; n++) {
    const [kind, pw, ph] = WALL_PIECES[rng.int(WALL_PIECES.length)];
    const px = x0 + 4 + rng.int(Math.max(1, w - pw - 8));
    const py = floor - 16 - ph - rng.int(6);
    if (py > top + 4 && clear(t, px - 1, py - 1, pw + 2, ph + 2) && !out.some((d) => d.x < px + pw + 3 && d.x + d.w > px - 3 && d.y < py + ph + 3 && d.y + d.h > py - 3)) {
      out.push({ kind, x: px, y: py, w: pw, h: ph, seed: rng.int(1 << 20) });
    }
  }
  // The level, stencilled by the door side, with hazard stripes under it.
  if (label && rng.next() < 0.3) {
    const sx = rng.next() < 0.5 ? x0 + 3 : x1 - 15;
    const sy = floor - 30;
    if (sy > top + 4 && clear(t, sx, sy, 12, 9)) out.push({ kind: DecorKind.Stencil, x: sx, y: sy, w: 12, h: 9, seed: rng.int(1 << 20), text: label });
  }
  // A fortress's rooms fly its banner.
  if (team !== undefined && rng.next() < 0.5) {
    const bx = x0 + 6 + rng.int(Math.max(1, w - 18));
    if (clear(t, bx, top, 7, 16) && t.get(bx + 3, top - 1) !== Mat.Air) out.push({ kind: DecorKind.Banner, x: bx, y: top, w: 7, h: 16, seed: rng.int(1 << 20), team });
  }
}
