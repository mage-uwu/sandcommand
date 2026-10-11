import { ACTOR_H, WORLD_H, WORLD_W } from './constants.ts';
import { arm, poly } from './deadland.ts';
import { type Flora, FloraKind } from './frosting.ts';
import { Mat, isDeadGround, isSoil } from './materials.ts';
import { growCrystal, growGem } from './rare-earth.ts';
import { Rng, hash2 } from './rng.ts';
import type { WaterBody } from './water.ts';

/**
 * The Valley of Souls: a biome of TABAR. A grand canyon across the middle
 * of the map, stepped walls capped with grey rock, a mesa or two standing
 * in it, a shallow pool on its floor; and at the heart of the floor, the
 * semiotic warning at its peak: a massive cement dome sealing a shaft,
 * ringed by caltrops and a field of teeth.
 *
 * Under the dome, the warning goes on: the Maw, a chamber of cement teeth
 * with next to no life in it. Then, deeper, the horror of the place: it is
 * calm. Quiet rooms teeming with alien life:
 * - **sargasso** rooms of slow weed and coral;
 * - **cisterns**: still, clear water (water.ts);
 * - the **forest**: great petrified trunks, chemotropic, branchless, floor
 *   to roof, their roots trailing down through the rock into the cistern
 *   beneath, as if they drink the poison out of the world;
 * - **gem caverns** of giant crystals, and at the bottom the **nest**,
 *   spectacularly rich in gems and coral, and empty. For now.
 *
 * Seeded and deterministic like the rest of worldgen.
 */

/** The valley's own back walls (after structures.ts Backdrop and the labyrinth's 3 and 4): the dome's rotunda, the shaft's ashlar, the forest's roots where a pass runs through them (and those of them that stand in front: no wall, but drawn over the play). */
export const VBack = { Rotunda: 5, Ashlar: 6, Roots: 7, RootsFront: 8 } as const;

export type RoomKind = 'maw' | 'sargasso' | 'basin' | 'forest' | 'cistern' | 'gems' | 'nest';

export interface ValleyRoom {
  kind: RoomKind;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface Valley {
  /** The canyon: its edges, the rim height outside it and its floor. */
  x0: number;
  x1: number;
  rim: number;
  floor: number;
  /** The dome: its centre (on the floor) and radius. */
  dome: { x: number; y: number; r: number };
  rooms: ValleyRoom[];
  /** Where the calm is: the cave rooms' span, and below what row. */
  calm: { x0: number; x1: number; y0: number };
  /** Where water stands (the pool, the basin, the cisterns): seeds; volumes once the ground is final. */
  waters: WaterBody[];
  /** The pool's seed on the canyon floor. */
  pool: { x: number; y: number; w: number };
  /** The cells of the passes under the trees (carveValley): kept open whatever else grows in later. */
  passes: number[];
}

const at = (x: number, y: number) => y * WORLD_W + x;
const inside = (x: number, y: number) => x >= 4 && x < WORLD_W - 4 && y >= 0 && y < WORLD_H - 12;

/** Smooth value noise in [0, 1] (bilinear over a hashed lattice `s` cells apart). */
function vnoise(x: number, y: number, s: number, seed: number): number {
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const fx = x / s - gx;
  const fy = y / s - gy;
  const h = (a: number, b: number) => (hash2(a, b, seed) >>> 0) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = h(gx, gy) + (h(gx + 1, gy) - h(gx, gy)) * sx;
  const bot = h(gx, gy + 1) + (h(gx + 1, gy + 1) - h(gx, gy + 1)) * sx;
  return top + (bot - top) * sy;
}

/**
 * Shape the land: the canyon cut into `heights` (stepped walls, mesas, a
 * flat heart for the dome, a dip for the pool). Returns the valley's plan
 * (rooms laid out, not yet carved).
 */
export function valleyHeights(heights: Int32Array, seed: number): Valley {
  const rng = new Rng(seed ^ 0x5011);
  const cx = Math.round(WORLD_W / 2 + rng.range(-220, 220));
  const hw = 950 + rng.int(180);
  const x0 = cx - hw;
  const x1 = cx + hw;
  // Towering cliffs: the rims stand high (little sky over them), the floor far below. A DEEP valley.
  const rim = Math.round(WORLD_H * 0.12);
  const floor = 520 + rng.int(20);
  const wall = 110 + rng.int(60);
  // The mesas: towers of rock standing in the canyon, off its heart.
  const mesas: { x: number; w: number; top: number }[] = [];
  for (let k = 1 + rng.int(2), tries = 0; k > 0 && tries < 20; tries++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = cx + side * (300 + rng.int(Math.max(1, hw - 520)));
    if (mesas.some((o) => Math.abs(o.x - x) < 260)) continue;
    mesas.push({ x, w: 45 + rng.int(45), top: rim + 60 + rng.int(120) });
    k--;
  }
  // The pool: on the floor, clear of the mesas and the dome and its caltrops.
  const pool = { x: 0, y: 0, w: 70 + rng.int(40) };
  for (let tries = 0; tries < 30; tries++) {
    const x = Math.round(cx + (rng.next() < 0.5 ? -1 : 1) * (430 + rng.int(Math.max(1, hw - wall - 560)))); // (outside the caltrops round the dome)
    if (mesas.some((o) => Math.abs(o.x - x) < o.w + pool.w + 20)) continue;
    pool.x = x;
    break;
  }
  if (!pool.x) pool.x = cx - 430;
  for (let x = 0; x < WORLD_W; x++) {
    const n = vnoise(x, 0, 60, seed ^ 0x51) - 0.5;
    let h: number;
    const d = Math.min(x - x0, x1 - x); // into the canyon from its nearer edge
    if (d <= 0) {
      // The rim: a plateau, ragged at the edge.
      h = rim + n * 40 + (d > -40 ? (vnoise(x, 3, 9, seed ^ 0x77) - 0.5) * 24 : 0);
    } else if (d < wall) {
      // The walls: sheer cliffs, a few narrow ledges on the way down.
      const t = d / wall;
      const step = Math.floor(t * 6) / 6 + (t * 6 - Math.floor(t * 6)) * 0.08;
      h = rim + (floor - rim) * Math.min(1, step) + n * 22;
    } else {
      h = floor + n * 14;
    }
    for (const ms of mesas) {
      const u = Math.abs(x - ms.x) / ms.w;
      if (u >= 1) continue;
      // Sheer, with a ledge part way down.
      const ledge = u > 0.75 ? 0.35 : 0;
      h = Math.min(h, ms.top + (floor - ms.top) * ledge + (vnoise(x, 5, 7, seed ^ 0x99) - 0.5) * 10);
    }
    // The dome's ground: flat.
    if (Math.abs(x - cx) < 200) h = floor + (Math.abs(x - cx) > 150 ? n * 8 * ((Math.abs(x - cx) - 150) / 50) : 0);
    // The pool's dip.
    const pu = Math.abs(x - pool.x) / pool.w;
    if (pu < 1) h += Math.round(12 * (1 - pu * pu));
    heights[x] = Math.max(80, Math.min(WORLD_H - 70, Math.round(h)));
  }
  pool.y = heights[pool.x] - 1;
  // The rooms, under the canyon floor (layers, each a little off the last).
  const dome = { x: cx, y: floor, r: 72 + rng.int(14) };
  const j = (a: number) => Math.round(rng.range(-a, a));
  const rooms: ValleyRoom[] = [];
  const maw: ValleyRoom = { kind: 'maw', x: cx, y: floor + 92, rx: 84, ry: 46 };
  const sarg: ValleyRoom = { kind: 'sargasso', x: cx - 250 + j(60), y: floor + 185 + j(10), rx: 78, ry: 46 };
  const basin: ValleyRoom = { kind: 'basin', x: cx + 270 + j(60), y: floor + 178 + j(10), rx: 92, ry: 54 };
  const forest: ValleyRoom = { kind: 'forest', x: cx - 580 + j(60), y: floor + 272, rx: 168, ry: 78 };
  const cistern: ValleyRoom = { kind: 'cistern', x: forest.x + j(30), y: forest.y + forest.ry + 62, rx: 112, ry: 30 };
  const gems: ValleyRoom = { kind: 'gems', x: cx + 560 + j(80), y: floor + 278, rx: 112, ry: 56 };
  const nest: ValleyRoom = { kind: 'nest', x: cx + 110 + j(60), y: 0, rx: 250, ry: 44 };
  nest.y = Math.min(WORLD_H - 34 - nest.ry, floor + 390);
  cistern.y = Math.min(cistern.y, WORLD_H - 36 - cistern.ry);
  rooms.push(maw, sarg, basin, forest, cistern, gems, nest);
  for (const r of rooms) r.x = Math.max(r.rx + 20, Math.min(WORLD_W - r.rx - 20, r.x));
  const cx0 = Math.min(...rooms.map((r) => r.x - r.rx)) - 30;
  const cx1 = Math.max(...rooms.map((r) => r.x + r.rx)) + 30;
  return {
    x0,
    x1,
    rim,
    floor,
    dome,
    rooms,
    calm: { x0: cx0, x1: cx1, y0: floor + 40 },
    waters: [],
    pool,
    passes: [],
  };
}

/** Is (x, y) inside room `r` (a blob: an ellipse, flatter underneath, its edge roughened)? */
function inRoom(r: ValleyRoom, x: number, y: number, seed: number): boolean {
  const dx = (x - r.x) / r.rx;
  const dyRaw = (y - r.y) / r.ry;
  const dy = dyRaw > 0 ? dyRaw * 1.25 : dyRaw;
  return dx * dx + dy * dy < 1 + (vnoise(x, y, 14, seed ^ 0xb10b) - 0.5) * 0.45;
}

/**
 * Carve and furnish the valley into the generated ground `m`: rock caps on
 * the rims and banded walls, the dome and its warning field, the rooms and
 * the passages between them, and what grows and glitters in each.
 */
export function carveValley(m: Uint8Array, v: Valley, seed: number, backdrop?: Uint8Array): void {
  const rng = new Rng(seed ^ 0x501f);
  const set = (x: number, y: number, mat: number) => {
    if (inside(x, y)) m[at(x, y)] = mat;
  };
  const topOf = (x: number) => {
    let y = 0;
    while (y < WORLD_H - 12 && m[at(x, y)] === Mat.Air) y++;
    return y;
  };
  // Grey caprock on the rims and along the walls' terraces, under the ruin's crust.
  for (let x = 6; x < WORLD_W - 6; x++) {
    let top = topOf(x);
    while (top < WORLD_H - 12 && isDeadGround(m[at(x, top)])) top++;
    const onFloor = x > v.x0 + 130 && x < v.x1 - 130 && top > v.floor - 30;
    if (onFloor) continue;
    const cap = 6 + Math.floor(vnoise(x, 1, 30, seed ^ 0xca9) * 10);
    for (let y = top; y < top + cap; y++) if (m[at(x, y)] !== Mat.Air) set(x, y, Mat.Rock);
  }

  // The rooms and their passages.
  const rooms = v.rooms;
  const byKind = (k: RoomKind) => rooms.find((r) => r.kind === k)!;
  for (const r of rooms) {
    for (let y = r.y - r.ry - 12; y <= r.y + r.ry * 1.1 + 12; y++) {
      for (let x = r.x - r.rx - 12; x <= r.x + r.rx + 12; x++) {
        if (!inside(x, y)) continue;
        if (inRoom(r, x, y, seed)) set(x, y, Mat.Air);
        else if (m[at(x, y)] !== Mat.Air && isSoil(m[at(x, y)]) && vnoise(x, y, 6, seed ^ 0x11) > 0.55) set(x, y, Mat.Rock); // (a rocky lining)
      }
    }
  }
  /** A winding passage between two rooms (from a point on each: water rooms are entered high, so they hold their water). */
  const passage = (a: ValleyRoom, b: ValleyRoom) => {
    const pa = { x: a.x, y: a.y - (a.kind === 'basin' || a.kind === 'cistern' ? a.ry * 0.55 : 0) };
    const pb = { x: b.x, y: b.y - (b.kind === 'basin' || b.kind === 'cistern' ? b.ry * 0.55 : 0) };
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const nx = -(pb.y - pa.y) / len;
    const ny = (pb.x - pa.x) / len;
    const amp = 14 + rng.int(18);
    const ph = rng.next() * Math.PI * 2;
    const r = 11 + rng.int(3);
    for (let s = 0; s <= len; s += 2) {
      const t = s / len;
      const w = Math.sin(t * Math.PI * 2 + ph) * amp * Math.sin(t * Math.PI);
      const px = pa.x + (pb.x - pa.x) * t + nx * w;
      const py = pa.y + (pb.y - pa.y) * t + ny * w;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) set(Math.round(px + dx), Math.round(py + dy), Mat.Air);
    }
  };
  const maw = byKind('maw');
  const sarg = byKind('sargasso');
  const basin = byKind('basin');
  const forest = byKind('forest');
  const cistern = byKind('cistern');
  const gems = byKind('gems');
  const nest = byKind('nest');
  passage(maw, sarg);
  passage(maw, basin);
  passage(sarg, forest);
  passage(basin, gems);
  passage(gems, nest);
  passage(forest, nest);
  passage(cistern, forest);

  // The shaft from the canyon floor down into the Maw, and the dome sealing it.
  const d = v.dome;
  // (Its walls and the dome's hollow get a back wall: an enclosed, made space,
  // not open sky. The dome's an ancient rotunda; the shaft is lined with ashlar.)
  const wall = (x: number, y: number, kind: number = VBack.Ashlar) => {
    if (backdrop && inside(x, y)) backdrop[at(x, y)] = kind;
  };
  for (let y = d.y - 4; y <= maw.y - maw.ry * 0.6; y++) {
    for (let x = d.x - 18; x <= d.x + 18; x++) {
      set(x, y, Mat.Air);
      wall(x, y);
    }
  }
  const shell = 14;
  for (let y = d.y - d.r; y <= d.y + 2; y++) {
    for (let x = d.x - d.r; x <= d.x + d.r; x++) {
      const dist = Math.hypot(x - d.x, Math.max(0, d.y - y) * 1.08);
      if (dist <= d.r && dist >= d.r - shell) set(x, y, Mat.Cement);
      else if (dist < d.r - shell) {
        set(x, y, Mat.Air);
        wall(x, y, VBack.Rotunda);
      }
    }
  }
  // A band of masonry round it, and squat pylons at its foot.
  const band = Math.round(d.y - d.r * 0.42);
  for (let y = band; y < band + 3; y++) {
    for (let x = d.x - d.r; x <= d.x + d.r; x++) {
      const dist = Math.hypot(x - d.x, (d.y - y) * 1.08);
      if (dist <= d.r && dist >= d.r - shell) set(x, y, Mat.RuinStone);
    }
  }
  // A keystone of masonry on its crown, over the shaft.
  for (let x = d.x - 24; x <= d.x + 24; x++) {
    let y = d.y - d.r - 2;
    while (y < d.y && m[at(x, y)] === Mat.Air) y++;
    for (let k = 0; k < 4; k++) if (m[at(x, y + k)] === Mat.Cement) set(x, y + k, Mat.RuinStone);
  }
  for (const side of [-1, 1]) {
    const px = d.x + side * (d.r + 10);
    for (let y = d.y - 18; y <= d.y + 2; y++) for (let x = px - 9; x <= px + 9; x++) set(x, y, Mat.Cement);
  }
  // The warning at its peak: caltrops standing round the dome, and teeth all over the floor.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = d.x + side * (d.r + 70 + k * 110 + rng.int(40));
      const g = topOf(x);
      const len = 55 + rng.int(55);
      const w = Math.round(len * 0.19);
      const rot = -Math.PI / 2 + rng.range(-0.15, 0.15);
      const hub = g - Math.sin(rot + (2 * Math.PI) / 3) * len * 0.92 + 6;
      for (let q = 0; q < 3; q++) arm(m, x, hub, rot + (q * 2 * Math.PI) / 3, len, w);
      poly(
        m,
        [
          [x - w, hub - w],
          [x + w, hub - w],
          [x + w, hub + w],
          [x - w, hub + w],
        ],
        Mat.Cement,
      );
    }
  }
  for (let x = v.x0 + wallClear(v); x < v.x1 - wallClear(v); x += 26 + rng.int(30)) {
    if (Math.abs(x - d.x) < d.r + 30 || Math.abs(x - v.pool.x) < v.pool.w + 10) continue;
    const g = topOf(x);
    const h = 6 + rng.int(10);
    const a = (rng.next() - 0.5) * (rng.next() < 0.3 ? 2 : 0.4);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const P = (px: number, py: number): [number, number] => [x + px * c - py * s, g + 3 + px * s + py * c];
    poly(m, [P(-h * 0.7, 0), P(h * 0.7, 0), P(0, -h)], Mat.Cement);
  }

  // The Maw: jaws of cement teeth all round its walls, a few blocks set into them.
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rng.range(-0.1, 0.1);
    // Out from the middle to the wall.
    let ex = maw.x;
    let ey = maw.y;
    for (let s = 0; s < 200; s++) {
      const px = Math.round(maw.x + Math.cos(a) * s);
      const py = Math.round(maw.y + Math.sin(a) * s);
      if (!inside(px, py) || m[at(px, py)] !== Mat.Air) break;
      ex = px;
      ey = py;
    }
    if (Math.abs(ex - d.x) < 22 && ey < maw.y) continue; // (not across the shaft)
    const len = 14 + rng.int(18);
    const base = 6 + rng.int(6);
    const c = Math.cos(a);
    const s = Math.sin(a);
    // A tooth from the wall, pointing in.
    poly(
      m,
      [
        [ex + c * 4 - s * base, ey + s * 4 + c * base],
        [ex + c * 4 + s * base, ey + s * 4 - c * base],
        [ex - c * len, ey - s * len],
      ],
      Mat.Cement,
    );
    if (k % 5 === 2) {
      // A block, half sunk in the wall.
      poly(
        m,
        [
          [ex - s * 9 + c * 8, ey + c * 9 + s * 8],
          [ex + s * 9 + c * 8, ey - c * 9 + s * 8],
          [ex + s * 9 - c * 6, ey - c * 9 - s * 6],
          [ex - s * 9 - c * 6, ey + c * 9 - s * 6],
        ],
        Mat.Cement,
      );
    }
  }

  // The forest: a hall of petrified trunks, floor to roof, their roots trailing down into the cistern.
  // Tall and slender, smooth as columns, each fanning out near the roof into a
  // vault of stone lattice that meets its neighbours' (after the Sea of
  // Corruption's petrified forest under the sand). Stumps and fallen logs on the floor.
  const roofOf = (x: number, y: number) => {
    while (y > 0 && m[at(x, y)] === Mat.Air) y--;
    return y;
  };
  const floorOf = (x: number, y: number) => {
    while (y < WORLD_H - 14 && m[at(x, y)] === Mat.Air) y++;
    return y;
  };
  /** Lattice: distance (in cells) to the nearest edge between jittered cells of size `s`, roughly. */
  const lattice = (x: number, y: number, s: number) => {
    const gx = Math.floor(x / s);
    const gy = Math.floor(y / s);
    let d1 = 1e9;
    let d2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const h = hash2(gx + ox, gy + oy, seed ^ 0x1a77);
        const px = (gx + ox + 0.15 + ((h & 0xff) / 255) * 0.7) * s;
        const py = (gy + oy + 0.15 + (((h >>> 8) & 0xff) / 255) * 0.7) * s;
        const dd = Math.hypot(x - px, (y - py) * 0.7);
        if (dd < d1) {
          d2 = d1;
          d1 = dd;
        } else if (dd < d2) d2 = dd;
      }
    }
    return (d2 - d1) / 2;
  };
  // Stumps among them: short, flat-topped, a little splayed at the foot.
  for (let k = 0; k < 4 + rng.int(3); k++) {
    const sx = Math.round(forest.x + rng.range(-forest.rx * 0.8, forest.rx * 0.8));
    const fy = floorOf(sx, forest.y);
    if (fy > forest.y + forest.ry || m[at(sx, fy - 3)] !== Mat.Air) continue;
    const w = 3 + rng.int(4);
    const h = 6 + rng.int(14);
    for (let y = fy - h; y <= fy + 2; y++) {
      const splay = y > fy - 3 ? 1 : 0;
      // (A broken one: its top snapped off at a slant.)
      for (let x = sx - w - splay; x <= sx + w + splay; x++) if (y >= fy - h + Math.round(((x - sx) / w) * (k & 1 ? 3 : 0))) set(x, y, Mat.Petrified);
    }
  }
  // A fallen log or two, lying on the floor.
  for (let k = 0; k < 1 + rng.int(2); k++) {
    const lx = Math.round(forest.x + rng.range(-forest.rx * 0.6, forest.rx * 0.6));
    const len = 26 + rng.int(22);
    const r = 3 + rng.int(3);
    // (Only where the floor's level enough to lie on.)
    let hi = WORLD_H;
    let lo = 0;
    for (let x = lx - (len >> 1); x <= lx + (len >> 1); x++) {
      const f = floorOf(x, forest.y);
      hi = Math.min(hi, f);
      lo = Math.max(lo, f);
    }
    if (lo - hi > 3 || lo > forest.y + forest.ry) continue;
    const fy = lo;
    for (let x = lx - (len >> 1); x <= lx + (len >> 1); x++) for (let y = fy - 2 * r; y < fy; y++) if (m[at(x, y)] === Mat.Air) set(x, y, Mat.Petrified);
  }

  /**
   * A fine root, grown from (x, y): `side` the way it spreads (-1 left, 1
   * right), `v` the way it heads (-1 up, 1 down), `t` its angle off that
   * vertical (0 straight on, near PI/2 out level). It tapers as it goes,
   * curls outward, now and then forks; in the rock it runs on a little way,
   * thinning fast.
   */
  const root = (x0: number, y0: number, side: number, v: number, t0: number, thick0: number, len: number) => {
    const stack = [{ x: x0, y: y0, t: t0, thick: thick0, len }];
    while (stack.length) {
      const r = stack.pop()!;
      let { x, y, t, thick } = r;
      const fall = r.thick / r.len;
      for (let step = 0; step < r.len * 2 && thick > 0.45; step++) {
        // (Looking just past its own last disc.)
        const ahead = Math.ceil(thick) + 1;
        const c = m[at(Math.round(x + side * Math.sin(t) * ahead), Math.round(y + v * Math.cos(t) * ahead))];
        const solid = c !== Mat.Air && c !== Mat.Petrified;
        thick -= solid ? fall * 3 : fall;
        t += (solid ? -0.03 : 0.02) + rng.range(-0.1, 0.1);
        t = Math.max(0.05, Math.min(1.5, t));
        x += side * Math.sin(t);
        y += v * Math.cos(t);
        disc(x, y, thick - 0.5);
        if (thick > 1.1 && !solid && rng.next() < 0.04) {
          stack.push({ x, y, t: t + rng.range(-0.6, 0.6), thick: thick * 0.7, len: Math.round(r.len * (0.4 + rng.next() * 0.4)) });
          thick *= 0.85;
        }
      }
    }
  };
  /** A disc of petrified wood (radius `r`; under a half, one cell); `mark`, if given, collects its cells. */
  const disc = (x: number, y: number, r: number, mark?: Set<number>) => {
    const rr = Math.max(0, r);
    const ir = Math.ceil(rr);
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy > rr * rr + 0.5) continue;
        const cx = Math.round(x) + dx;
        const cy = Math.round(y) + dy;
        set(cx, cy, Mat.Petrified);
        if (mark && inside(cx, cy)) mark.add(at(cx, cy));
      }
    }
  };
  /** The roots that stand in front, where a pass runs through them: you duck behind them, not into them. */
  const fronted = new Set<number>();
  const trunks = 6 + rng.int(3);
  const feet: { tx: number; fy: number; half: number }[] = [];
  const span = forest.rx * 1.7;
  const gap = span / trunks;
  for (let k = 0; k < trunks; k++) {
    const tx = Math.round(forest.x - span / 2 + (k + 0.5) * gap + rng.range(-gap * 0.18, gap * 0.18));
    const fy = floorOf(tx, forest.y);
    const cy = roofOf(tx, forest.y);
    const w = 4 + rng.int(3); // (half its girth: slender)
    const H = fy - cy;
    const fan = 0.42 + rng.next() * 0.16; // (how far down from the roof the vault begins)
    const reach = gap * (0.5 + rng.next() * 0.15); // (how wide it spreads at the roof)
    const footH = H * (0.16 + rng.next() * 0.08); // (how far up its foot begins to part)
    const foot = gap * (0.3 + rng.next() * 0.12);
    // (Over the trunk's own roof, the vault fills only the room's open air up to its roof, wherever that is.)
    const ceil = new Map<number, number>();
    const ceilOf = (x: number) => {
      let c = ceil.get(x);
      if (c === undefined) ceil.set(x, (c = m[at(x, cy)] === Mat.Air ? roofOf(x, cy) : cy));
      return c;
    };
    // The vault behind: a lattice of fine roots grown together, densest against the roof, thinning toward its edge.
    for (let y = cy - 60; y <= cy + H * fan; y++) {
      const u = Math.min(1, Math.max(0, 1 - (y - cy) / (H * fan)));
      const out = w + Math.pow(u, 1.6) * reach * 1.1;
      for (let x = Math.round(tx - out); x <= Math.round(tx + out); x++) {
        const dx = Math.abs(x - tx);
        if (m[at(x, y)] !== Mat.Air || (y < cy && y <= ceilOf(x))) continue;
        const edge = Math.sqrt(Math.max(0, 1 - dx / out));
        if (lattice(x, y, 15) < (0.55 + u * u * u * 1.5) * edge) set(x, y, Mat.Petrified);
      }
    }
    // The trunk: a bundle of strands grown together into one smooth column,
    // parting toward each end into roots, up into the roof and down into the
    // floor, each tapering as it goes.
    // Its spread at each height: one girth up the middle, flaring smoothly (exponentially,
    // like a real root flare) toward each end into the roots.
    const Lb = footH / 2.6;
    const Lt = (H * fan) / 2.8;
    const flare = (y: number) => ({ b: Math.exp(-Math.max(0, fy - y) / Lb), t: Math.exp(-Math.max(0, y - cy) / Lt) });
    const spread = (y: number) => {
      const f = flare(y);
      return w + f.b * foot + f.t * reach;
    };
    // The heart of it, solid: swelling a little way out into the flare, so the roots part from a smooth body, not a stump.
    for (let y = cy; y <= fy; y++) {
      const half = w + (spread(y) - w) * 0.16;
      for (let x = Math.round(tx - half); x <= Math.round(tx + half); x++) set(x, y, Mat.Petrified);
    }
    const n = 5 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const o = n === 1 ? 0 : (i / (n - 1)) * 2 - 1 + rng.range(-0.12, 0.12); // (-1..1: its place across the trunk)
      const r0 = Math.max(1.6, (w * 1.7) / n + 0.6);
      const own = 0.75 + rng.next() * 0.6; // (how far it reaches, against its neighbours)
      const wob = rng.range(0, Math.PI * 2);
      // (Now and then an outer one stands in front of the pass through its foot.)
      const front = Math.abs(o) > 0.35 && (hash2(k, i, seed ^ 0xf407) >>> 0) / 4294967296 < 0.45;
      const xAt = (y: number) => {
        const f = flare(y);
        return tx + o * (w - r0 * 0.6 + (f.b * foot + f.t * reach) * own) + Math.sin(y * 0.09 + wob) * (f.b + f.t) * 1.5;
      };
      // Thick where it leaves the trunk, tapering the farther out it gets.
      const rAt = (y: number) => {
        const f = flare(y);
        const out = Math.abs(xAt(y) - tx) / (w + (f.b > f.t ? foot : reach));
        return r0 * (1 + 0.3 * Math.max(f.b, f.t)) * Math.max(0.4, 1 - out * 0.7);
      };
      // Grown from its middle out to each end, and on past it, until it's well into the rock
      // (wherever the roof or the floor is: lower off to the side than over the trunk).
      const mid = Math.round((cy + fy) / 2);
      for (const dir of [-1, 1]) {
        const end = dir < 0 ? cy : fy;
        const slope = Math.max(-2.2, Math.min(2.2, (xAt(end) - xAt(end - dir * 3)) / 3));
        let px = xAt(mid);
        let inRock = 0;
        let shrink = 0;
        for (let y = mid + dir; Math.abs(y - mid) < H; y += dir) {
          const past = dir * (y - end); // (how far past its end, if it is)
          const x = past > 0 ? xAt(end) + slope * past : xAt(y);
          // (Looking just past its own last disc.)
          const c = m[at(Math.round(x), y + dir * (Math.ceil(rAt(Math.max(cy, Math.min(fy, y))) - shrink) + 1))];
          if (c !== Mat.Air && c !== Mat.Petrified) inRock++;
          if (inRock) shrink += 0.2;
          else if (past > 0) shrink += 0.01;
          const r = rAt(Math.max(cy, Math.min(fy, y))) - shrink;
          if (inRock > 9 || r < 0.4) break;
          const steps = Math.max(1, Math.ceil(Math.abs(x - px)));
          for (let s2 = 1; s2 <= steps; s2++) disc(px + ((x - px) * s2) / steps, y - dir + (dir * s2) / steps, r, front && dir > 0 ? fronted : undefined);
          px = x;
        }
      }
      // The outer strands put out fine roots of their own, fanning along the roof and the floor.
      if (Math.abs(o) > 0.5) {
        const side = Math.sign(o);
        const yu = Math.round(cy + H * fan * (0.3 + rng.next() * 0.3));
        root(xAt(yu), yu, side, -1, 0.9 + rng.next() * 0.4, 1.3, 20 + rng.int(20));
        const yd = Math.round(fy - footH * (0.2 + rng.next() * 0.4));
        root(xAt(yd), yd, side, 1, 0.9 + rng.next() * 0.4, 1.2, 14 + rng.int(14));
      }
    }
    feet.push({ tx, fy, half: w + foot + 3 });
    // Roots: down from its foot through the rock, into the cistern, trailing in the water.
    if (Math.abs(tx - cistern.x) < cistern.rx * 0.8) {
      for (let r = 0; r < 2 + rng.int(3); r++) {
        let rx = tx + rng.range(-w, w);
        const thick = 1;
        const end = cistern.y + cistern.ry * (0.2 + rng.next() * 0.5);
        for (let y = fy; y < end; y++) {
          rx += rng.range(-0.6, 0.6) + Math.sin(y * 0.2 + r) * 0.3;
          for (let x = Math.round(rx) - thick; x <= Math.round(rx) + thick; x++) set(x, y, Mat.Petrified);
        }
      }
    }
  }
  // A pass through each one's foot (once they're all grown: the roots cross): the root flare
  // there set back (a back wall drawn as the roots), so you can walk through under the trunk
  // without cutting it; a root or two of it standing in front instead (drawn over whoever's
  // behind it, never solid), to duck behind. An arch over clone height across the middle of the flare, closing
  // down toward its edges.
  for (const { tx, fy, half } of feet) {
    for (let x = Math.round(tx - half); x <= Math.round(tx + half); x++) {
      // (The ground under the roots here.)
      let g = fy - 20;
      while (g < fy + 12 && (m[at(x, g)] === Mat.Air || m[at(x, g)] === Mat.Petrified)) g++;
      const d = Math.abs(x - tx) / half;
      const clear = Math.round((ACTOR_H + 4 + 7 * (1 - d * d)) * Math.min(1, (1 - d) * 3)); // (an arch)
      for (let y = g - clear; y < g; y++) {
        if (m[at(x, y)] !== Mat.Petrified) continue;
        set(x, y, Mat.Air);
        if (inside(x, y)) v.passes.push(at(x, y));
        // (Away from the trunk's heart: right under it, it'd hide the whole pass.)
        wall(x, y, fronted.has(at(x, y)) && Math.abs(x - tx) > half * 0.3 ? VBack.RootsFront : VBack.Roots);
      }
    }
  }
  // Gem caverns and the nest: giant crystals off the floors and roofs; the nest's walls laced with GEMM and rare earth.
  const crystals = (r: ValleyRoom, n: number, scale: number) => {
    for (let k = 0; k < n; k++) {
      const x = Math.round(r.x + rng.range(-r.rx * 0.85, r.rx * 0.85));
      const fromRoof = k % 3 === 2;
      let y = r.y;
      if (fromRoof) while (y > 0 && m[at(x, y)] === Mat.Air) y--;
      else while (y < WORLD_H - 14 && m[at(x, y)] === Mat.Air) y++;
      growGem(m, x, y, rng, scale * (0.7 + rng.next() * 0.6), fromRoof ? Math.PI / 2 : -Math.PI / 2, true);
    }
  };
  crystals(gems, 9, 2.6);
  crystals(nest, 14, 3);
  for (const r of [gems, nest]) {
    const rich = r === nest ? 0.42 : 0.25;
    for (let y = r.y - r.ry - 14; y <= r.y + r.ry * 1.1 + 14; y++) {
      for (let x = r.x - r.rx - 14; x <= r.x + r.rx + 14; x++) {
        if (!inside(x, y) || m[at(x, y)] === Mat.Air || !(isSoil(m[at(x, y)]) || m[at(x, y)] === Mat.Rock)) continue;
        if (vnoise(x, y, 9, seed ^ 0x6e3) > 1 - rich) set(x, y, Mat.Gold);
      }
    }
    for (let k = 0; k < (r === nest ? 16 : 6); k++) {
      const x = Math.round(r.x + rng.range(-r.rx - 8, r.rx + 8));
      const y = Math.round(r.y + rng.range(-r.ry - 8, r.ry + 8));
      if (inside(x, y) && !inRoom(r, x, y, seed)) growCrystal(m, x, y, rng);
    }
  }
}

/** How far in from the canyon's edges its floor (and the warning field) starts. */
const wallClear = (v: Valley) => Math.round((v.x1 - v.x0) * 0.08);

/**
 * The valley's own life, once the ground is final: weed and coral thick in
 * the sargasso rooms, small growth at the trunks' feet, coral and hanging
 * coral filling the nest, almost nothing in the Maw.
 */
export function valleyFlora(m: Uint8Array, v: Valley, seed: number): Flora[] {
  const rng = new Rng(seed ^ 0xf10a);
  const out: Flora[] = [];
  const floorAt = (x: number, y: number) => {
    while (y < WORLD_H - 14 && m[at(x, y)] === Mat.Air) y++;
    return m[at(x, y)] !== Mat.Air && m[at(x, y - 1)] === Mat.Air ? y : -1;
  };
  const roofAt = (x: number, y: number) => {
    while (y > 0 && m[at(x, y)] === Mat.Air) y--;
    return m[at(x, y)] !== Mat.Air && m[at(x, y + 1)] === Mat.Air ? y : -1;
  };
  const growable = (mm: number) => mm === Mat.Rock || isSoil(mm) || mm === Mat.Petrified || mm === Mat.Gold;
  for (const r of v.rooms) {
    const density = { maw: 0.03, sargasso: 0.55, basin: 0.12, forest: 0.18, cistern: 0.1, gems: 0.12, nest: 0.4 }[r.kind];
    for (let x = r.x - r.rx; x <= r.x + r.rx; x += 3) {
      if (rng.next() > density) continue;
      const y = floorAt(x, r.y);
      if (y >= 0 && growable(m[at(x, y)]) && !inRoomFar(r, x, y)) {
        const kind =
          r.kind === 'sargasso' ? (rng.next() < 0.75 ? FloraKind.Kelp : FloraKind.Coral) : r.kind === 'forest' ? (rng.next() < 0.6 ? FloraKind.Puffs : FloraKind.Coral) : r.kind === 'nest' ? (rng.next() < 0.7 ? FloraKind.Coral : FloraKind.Kelp) : FloraKind.Coral;
        out.push({ kind, x, y, seed: rng.nextU32() });
      }
      if (r.kind === 'nest' || r.kind === 'sargasso' || r.kind === 'forest') {
        if (rng.next() < 0.35) {
          const ry = roofAt(x, r.y);
          if (ry >= 0 && growable(m[at(x, ry)]) && m[at(x, ry + 12)] === Mat.Air) out.push({ kind: FloraKind.Hanging, x, y: ry, seed: rng.nextU32() });
        }
      }
    }
  }
  return out;
}

/** A floor found from a room's middle that's really some other room's (a long way off). */
const inRoomFar = (r: ValleyRoom, x: number, y: number) => y > r.y + r.ry * 1.6 + 20 || Math.abs(x - r.x) > r.rx + 10;

/**
 * The water, once the ground is final: the pool on the canyon floor, the
 * basin and the cisterns, each a volume let in at its lowest open cell.
 */
export function valleyWaters(m: Uint8Array, v: Valley): WaterBody[] {
  const out: WaterBody[] = [];
  const lowest = (x: number, y: number) => {
    while (y < WORLD_H - 14 && m[at(x, y + 1)] === Mat.Air) y++;
    return y;
  };
  const add = (x0: number, yFrom: number, volume: number) => {
    // (The seed's column: the nearest open one to the middle, roots and crystals aside.)
    let x = x0;
    for (let k = 0; k < 60 && m[at(x, yFrom)] !== Mat.Air; k++) x = x0 + (k % 2 ? 1 : -1) * ((k + 1) >> 1) * 2;
    if (m[at(x, yFrom)] !== Mat.Air) return;
    const y = lowest(x, yFrom);
    out.push({ x, y, volume: Math.round(volume), level: y });
  };
  add(v.pool.x, v.pool.y - 2, v.pool.w * 7);
  for (const r of v.rooms) {
    if (r.kind === 'basin') add(r.x, r.y, r.rx * r.ry * 0.95);
    if (r.kind === 'cistern') add(r.x, r.y, r.rx * r.ry * 1.25);
  }
  return out;
}
