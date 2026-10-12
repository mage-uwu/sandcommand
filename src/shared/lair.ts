import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng } from './rng.ts';

/**
 * Extermination's map: the **lair**. One giant cave hollowed out under the
 * map, nearly its whole width: the basilisks' home ground. Rock partitions
 * rise from its floor or hang from its roof, splitting it into chambers
 * (LAIR_DENS of them), each with a ledge or two up its walls and dripstone
 * hanging from its roof, and a basilisk hibernating on each chamber's floor
 * (the server puts them there: World.startExtermination). Two or three broad
 * chutes drop into it from the surface: the way in, for everyone pouring
 * down to fight them on their own ground.
 *
 * Deterministic from the seed (the client carves the same lair from it).
 */
export interface Den {
  /** Its chamber's middle, and how far it reaches each way. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Where a basilisk lies on the chamber's floor (an open cell, rock under it). */
  floorX: number;
  floorY: number;
}
export interface Lair {
  /** The chambers, west to east (a basilisk's den on each one's floor). */
  dens: Den[];
  /** The chutes down into it from the surface: where they open (x on the surface). */
  mouths: number[];
  /** The cave's span (x), and its roof and floor at each column inside it (-1 outside). */
  x0: number;
  x1: number;
  roof: Int16Array;
  floor: Int16Array;
}

export const LAIR_DENS = 4;
/** The cave: how far in from the map's ends it starts, how far under the surface its roof is, how tall it stands. */
const LAIR_MARGIN = 260;
const LAIR_DEPTH = 120;
const LAIR_HEIGHT = 250;
/** The chutes down into it: half-width (room for a tank to drop down one). */
const CHUTE_HALF = 22;
/** A gap left past each partition (cells): room for a basilisk, and for a clone to jet through. */
const PARTITION_GAP = 64;

const set = (m: Uint8Array, x: number, y: number, mat: number) => {
  if (x < 1 || x >= WORLD_W - 1 || y < 1 || y >= WORLD_H - 14) return;
  const i = y * WORLD_W + x;
  if (m[i] !== Mat.Bedrock) m[i] = mat;
};

/** Hollow a disc of air (a chute's bore), leaving bedrock alone. */
function bore(m: Uint8Array, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(m, x, y, Mat.Air);
    }
  }
}

/** Carve the lair into the map (`heights`: the surface at each column). */
export function carveLair(m: Uint8Array, heights: Int32Array, seed: number): Lair {
  const rng = new Rng(seed ^ 0x1a12);
  const x0 = LAIR_MARGIN;
  const x1 = WORLD_W - LAIR_MARGIN;
  const roof = new Int16Array(WORLD_W).fill(-1);
  const floor = new Int16Array(WORLD_W).fill(-1);
  // The surface, smoothed (the cave's roof follows the lie of the land, not every bump in it).
  const smooth = (x: number) => {
    let s = 0;
    let n = 0;
    for (let k = -60; k <= 60; k += 6) {
      s += heights[Math.max(0, Math.min(WORLD_W - 1, x + k))];
      n++;
    }
    return s / n;
  };
  const p = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  for (let x = x0; x <= x1; x++) {
    // Rounded off at its ends.
    const f = Math.min(1, (x - x0) / 140, (x1 - x) / 140);
    const env = Math.sqrt(Math.max(0, f));
    const top = smooth(x) + LAIR_DEPTH + 18 * Math.sin(x * 0.013 + p[0]) + 9 * Math.sin(x * 0.041 + p[1]);
    const mid = top + LAIR_HEIGHT / 2;
    const h = Math.max(40, LAIR_HEIGHT * env + 24 * Math.sin(x * 0.009 + p[2]) + 8 * Math.sin(x * 0.053 + p[3]));
    roof[x] = Math.max(10, Math.round(mid - h / 2));
    floor[x] = Math.min(WORLD_H - 40, Math.round(mid + h / 2));
    for (let y = roof[x]; y <= floor[x]; y++) set(m, x, y, Mat.Air);
  }
  // Dripstone off the roof: little cones here and there.
  for (let k = 0; k < 70; k++) {
    const cx = x0 + 30 + rng.int(x1 - x0 - 60);
    const len = 6 + rng.int(16);
    for (let d = 0; d < len; d++) {
      const w = Math.round((1 - d / len) * 3);
      for (let x = cx - w; x <= cx + w; x++) set(m, x, roof[cx] + d, Mat.Rock);
    }
  }
  // The partitions between the chambers: by turns a wall up from the floor
  // (a gap left under the roof) and a curtain hung from the roof (a gap left
  // over the floor), thick, ragged at the edges.
  const cuts: number[] = [];
  for (let k = 1; k < LAIR_DENS; k++) {
    const cx = Math.round(x0 + ((x1 - x0) * k) / LAIR_DENS + rng.range(-40, 40));
    cuts.push(cx);
    const fromFloor = k % 2 === 1;
    const half = 26 + rng.int(14);
    for (let x = cx - half - 6; x <= cx + half + 6; x++) {
      const edge = Math.abs(x - cx) - half;
      const top = roof[x];
      const bot = floor[x];
      if (top < 0) continue;
      // (Its sides taper, a little rough.)
      const shave = edge > 0 ? edge * 4 + rng.int(4) : rng.int(3);
      if (fromFloor) for (let y = top + PARTITION_GAP + shave; y <= bot; y++) set(m, x, y, Mat.Rock);
      else for (let y = top; y <= bot - PARTITION_GAP - shave; y++) set(m, x, y, Mat.Rock);
    }
  }
  // The chambers: ledges up their walls (rock shelves to stand on and fight from).
  const bounds = [x0, ...cuts, x1];
  for (let c = 0; c < LAIR_DENS; c++) {
    const a = bounds[c] + 40;
    const b = bounds[c + 1] - 40;
    const shelves = 1 + rng.int(2);
    for (let s = 0; s < shelves; s++) {
      const w = 50 + rng.int(50);
      const sx = a + rng.int(Math.max(1, b - a - w));
      const sy = Math.round(roof[sx] + (floor[sx] - roof[sx]) * (0.35 + rng.next() * 0.25));
      for (let x = sx; x < sx + w; x++) for (let y = sy; y < sy + 6 + (x === sx || x === sx + w - 1 ? -3 : 0); y++) set(m, x, y, Mat.Rock);
    }
  }
  // Where each chamber's den will be (its middle, give or take).
  const denX = bounds.slice(0, LAIR_DENS).map((a0, c) => Math.round((a0 + 50 + bounds[c + 1] - 50) / 2 + rng.range(-30, 30)));
  // The chutes down: two or three, each into a chamber (off to one side of its den), from the surface into the roof.
  const nChutes = 2 + rng.int(2);
  const mouths: number[] = [];
  const order = [0, 1, 2, 3].sort(() => rng.next() - 0.5).slice(0, nChutes).sort((p0, q) => p0 - q);
  for (const c of order) {
    const a = bounds[c] + 60;
    const b = bounds[c + 1] - 60;
    // (Not right over the den: off one side of it or the other, whichever has room.)
    const left = denX[c] - 140 - a;
    const right = b - (denX[c] + 140);
    const mx = left >= right ? Math.round(a + rng.int(Math.max(1, left))) : Math.round(denX[c] + 140 + rng.int(Math.max(1, right)));
    mouths.push(mx);
    const ex = mx + rng.range(-30, 30);
    const sy = heights[mx] - 4;
    const ey = roof[Math.round(ex)] + 12;
    const steps = Math.ceil((ey - sy) / 3);
    const wig = rng.range(0, 6.28);
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      bore(m, mx + (ex - mx) * f + Math.sin(f * 6 + wig) * 6, sy + (ey - sy) * f, CHUTE_HALF);
    }
  }
  // The dens: one on each chamber's floor, levelled off, with room over it.
  const dens: Den[] = [];
  for (let c = 0; c < LAIR_DENS; c++) {
    const a = bounds[c] + 50;
    const b = bounds[c + 1] - 50;
    const x = denX[c];
    let fy = floor[x];
    // Level a pad for it to lie on (open over it, rock under it).
    for (let xx = x - 40; xx <= x + 40; xx++) {
      for (let y = fy - 40; y <= fy; y++) set(m, xx, y, Mat.Air);
      set(m, xx, fy + 1, Mat.Rock);
      set(m, xx, fy + 2, Mat.Rock);
    }
    fy = Math.min(fy, WORLD_H - 20);
    dens.push({ x, y: Math.round((roof[x] + floor[x]) / 2), rx: Math.round((b - a) / 2), ry: Math.round((floor[x] - roof[x]) / 2), floorX: x, floorY: fy });
  }
  return { dens, mouths, x0, x1, roof, floor };
}
