import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng } from './rng.ts';

/**
 * Extermination's map: the **lair**. Four great dens hollowed out under
 * the ground, spread along the map, a basilisk hibernating in each (the
 * server puts them there: World.startExtermination). Every den is easy to
 * reach, and so easy to disturb: a broad sloping tunnel runs down to it
 * from the surface (wide enough to walk, or drive, down), and a passage
 * joins each den to the next, deep under everything.
 *
 * Deterministic from the seed (the client carves the same lair from it).
 */
export interface Den {
  /** Its middle, and how far it reaches each way (an oval hall). */
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Where a basilisk lies on its floor (an open cell, rock under it). */
  floorX: number;
  floorY: number;
}
export interface Lair {
  dens: Den[];
  /** The tunnels down to each den from the surface: where they open (x on the surface). */
  mouths: number[];
}

export const LAIR_DENS = 4;
const DEN_RX = 90;
const DEN_RY = 34;
/** The tunnels: half-width, and how steep they run (cells down per cell along). */
const TUNNEL_HALF = 12;
const TUNNEL_SLOPE = 0.55;

/** Hollow a disc of air (a tunnel's bore), leaving bedrock alone. */
function bore(m: Uint8Array, cx: number, cy: number, r: number): void {
  for (let y = Math.max(1, Math.floor(cy - r)); y <= Math.min(WORLD_H - 14, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(1, Math.floor(cx - r)); x <= Math.min(WORLD_W - 2, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = y * WORLD_W + x;
      if (m[i] !== Mat.Bedrock) m[i] = Mat.Air;
    }
  }
}

/** Carve the lair into the map (`heights`: the surface at each column). */
export function carveLair(m: Uint8Array, heights: Int32Array, seed: number): Lair {
  const rng = new Rng(seed ^ 0x1a12);
  const dens: Den[] = [];
  const mouths: number[] = [];
  for (let k = 0; k < LAIR_DENS; k++) {
    const x = Math.round(((k + 0.5) / LAIR_DENS) * WORLD_W + rng.range(-0.08, 0.08) * (WORLD_W / LAIR_DENS));
    const surf = heights[Math.max(0, Math.min(WORLD_W - 1, x))];
    const y = Math.min(WORLD_H - 90, surf + 190 + rng.int(60));
    const rx = DEN_RX + rng.int(30);
    const ry = DEN_RY + rng.int(12);
    // The den: an oval hall, its floor flattened (the bottom fifth trimmed level).
    const floorY = Math.floor(y + ry * 0.6);
    for (let yy = y - ry; yy <= y + ry; yy++) {
      for (let xx = x - rx; xx <= x + rx; xx++) {
        if (xx < 1 || xx >= WORLD_W - 1 || yy < 1 || yy >= WORLD_H - 14) continue;
        const e = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2;
        if (e <= 1 && yy <= floorY) m[yy * WORLD_W + xx] = Mat.Air;
      }
    }
    // (Solid under its floor, so whatever lies there lies on rock.)
    for (let xx = x - rx; xx <= x + rx; xx++) if (xx > 0 && xx < WORLD_W - 1 && m[(floorY + 1) * WORLD_W + xx] === Mat.Air) m[(floorY + 1) * WORLD_W + xx] = Mat.Rock;
    // The tunnel down to it: from the surface off to one side, sloping down into the den's end.
    // (Always toward the middle of the map, never into the walls at its ends.)
    const dir = x < WORLD_W / 2 ? 1 : -1;
    const drop = floorY - 8 - surf;
    const run = Math.round(drop / TUNNEL_SLOPE);
    const mx = Math.round(Math.max(40, Math.min(WORLD_W - 40, x + dir * (rx * 0.6 + run))));
    mouths.push(mx);
    const sx = mx;
    const sy = heights[mx] - 4;
    const ex = x + dir * rx * 0.6;
    const ey = floorY - TUNNEL_HALF - 1; // (its bore's bottom level with the den floor)
    const steps = Math.ceil(Math.hypot(ex - sx, ey - sy) / 3);
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      bore(m, sx + (ex - sx) * f, sy + (ey - sy) * f, TUNNEL_HALF);
    }
    dens.push({ x, y, rx, ry, floorX: x, floorY });
  }
  // The passages between the dens, deep down: a broad worm-track from each to the next.
  for (let k = 0; k + 1 < dens.length; k++) {
    const a = dens[k];
    const b = dens[k + 1];
    const ax = a.x + a.rx * 0.8;
    const bx = b.x - b.rx * 0.8;
    const steps = Math.ceil((bx - ax) / 3);
    const phase = rng.range(0, Math.PI * 2);
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const y = a.floorY - 10 + (b.floorY - a.floorY) * f + Math.sin(f * Math.PI * 2 + phase) * 22;
      bore(m, ax + (bx - ax) * f, y, 10);
    }
  }
  return { dens, mouths };
}
