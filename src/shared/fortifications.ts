import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat, isSoil } from './materials.ts';
import { Rng } from './rng.ts';
import { type Box, type Complex, DOOR_H, HOLE_W, MOD_H, MOD_W, SCALE, SLAB, Style, WALL, fill } from './structures.ts';
import { WeaponId } from './weapons.ts';

/**
 * The works around the bunkers, built into the map after them (with their own
 * random stream, so the bunkers themselves come out as they always did):
 *
 * - **Steel doors** in the bunkers' outer doorways (and the strongroom's),
 *   sliding up for their own side's soldiers only (World.doors).
 * - **Reinforcing slabs**: thick concrete poured against the outer end walls
 *   above the doors, so a wall takes far more to breach.
 * - **Strongrooms**: a great vault under some bunkers, a storey and a half
 *   high and up to three modules long, cast in pig iron (a quarter as easy
 *   to blast or dig as concrete) behind a steel door, gold stacked inside.
 * - **Iron blocks**: great cubes of pig iron sunk in the open ground nearby.
 * - **Dragon's teeth**: rows of sheer concrete pyramids too tall for a
 *   tank to climb, with room between them for a clone to land and take cover.
 * - **Sandbags**: piles a crouching clone hides behind, outside the doors and
 *   on the roofs.
 * - **Trenches**: dug in the open ground, deep enough to stand in unseen,
 *   with a fire step half way up at the front to peep out from and steps
 *   out at the back.
 *
 * Integer arithmetic and the seeded Rng only, so every engine builds the
 * same thing.
 */

/** A bunker door: the cells it fills when shut, and whose it is (Team; it opens for anyone in a mode without teams). */
export interface DoorSpec extends Box {
  team: number;
}

export interface Trench {
  /** Its pit, back wall to front wall, and the surface at its lip. */
  x0: number;
  x1: number;
  ground: number;
  /** Which way it faces (the fire step is on that side): 1 east, -1 west. */
  dir: number;
  /** The fire step: its standing surface and its x span. */
  step: Box;
  /** The pit floor's standing surface. */
  floor: number;
}

export interface Works {
  teeth: Box[];
  sandbags: Box[];
  trenches: Trench[];
  cubes: Box[];
}

/** What the last fortifyBunkers built in the open (tests and bots). */
export let lastWorks: Works = { teeth: [], sandbags: [], trenches: [], cubes: [] };

/** Pig-iron lining of a strongroom. */
export const IRON = 4 * SCALE;
/** A strongroom's height inside: a storey and a half. */
export const STRONGROOM_H = 36 * SCALE;
/** Dragon's teeth: base width, height above the ground, and the gap between them (a clone's landing). */
export const TOOTH_W = 9 * SCALE;
export const TOOTH_H = 12 * SCALE;
export const TOOTH_GAP = 7 * SCALE;
/** Sandbag piles: taller than a crouching clone (10), shorter than a standing one (14). */
export const BAGS_H = 12;
/** Trenches: deeper than a standing clone, the fire step half way (a standing clone's head clears the lip). */
export const TRENCH_D = 17;
export const STEP_D = 9;
/** Thickness of a reinforcing slab. */
const BUTTRESS = 6 * SCALE;

const teamOf = (c: Complex) => c.owner ?? (c.fortress ? c.fortress.team : (c.x0 + c.x1) / 2 < WORLD_W / 2 ? 0 : 1);

/**
 * The bunkers' own works (doors, slabs, strongrooms), before their back walls
 * are marked; the strongroom joins the complex's vaults.
 */
export function fortifyComplexes(m: Uint8Array, complexes: Complex[], seed: number): void {
  const rng = new Rng(seed ^ 0xd00d5);
  for (const c of complexes) {
    if (c.tower) continue;
    const len = c.heights.length;
    const team = teamOf(c);
    const fort = !!c.fortress || c.style === Style.Fortified || c.owner !== undefined;
    const faced = fort ? 2 * SCALE : 0; // (steel facing already on the outer walls)
    c.doors = [];
    for (const west of [true, false]) {
      const bx = west ? c.x0 : c.x1 - WALL;
      const storeys = c.heights[west ? 0 : len - 1];
      // A slab against the outer wall, above the doorway.
      if (fort || rng.next() < 0.6) {
        const sx = west ? c.x0 - faced - BUTTRESS : c.x1 + faced;
        const top = c.floor - storeys * MOD_H;
        fill(m, sx, top + 2 * SCALE, sx + BUTTRESS, c.floor - DOOR_H - 2, Mat.Concrete);
        // (Chamfered at the top and over the door.)
        const out = west ? sx : sx + BUTTRESS - 2 * SCALE;
        fill(m, out, top + 2 * SCALE, out + 2 * SCALE, top + 4 * SCALE, Mat.Air);
      }
      // A steel door in the doorway, if there is one (never a ruin's).
      const open = m[(c.floor - 2) * WORLD_W + bx + (WALL >> 1)] === Mat.Air && m[(c.floor - DOOR_H + 1) * WORLD_W + bx + (WALL >> 1)] === Mat.Air;
      if (open && c.style !== Style.Ruined && (fort || rng.next() < 0.6)) {
        const d = { x0: bx, y0: c.floor - DOOR_H, x1: bx + WALL, y1: c.floor, team };
        fill(m, d.x0, d.y0, d.x1, d.y1, Mat.Door);
        c.doors.push(d);
      }
    }
    // A great fortress (Siege's) has doors inside too: every third ground-floor doorway, so it can be held room by room.
    if (c.fortress && len >= 10) {
      for (let b = 3; b < len; b += 3) {
        const bx = c.x0 + b * MOD_W;
        if (m[(c.floor - 2) * WORLD_W + bx + (WALL >> 1)] !== Mat.Air || m[(c.floor - DOOR_H + 1) * WORLD_W + bx + (WALL >> 1)] !== Mat.Air) continue;
        const d = { x0: bx, y0: c.floor - DOOR_H, x1: bx + WALL, y1: c.floor, team };
        fill(m, d.x0, d.y0, d.x1, d.y1, Mat.Door);
        c.doors.push(d);
      }
    }
    if (!c.fortress && c.owner === undefined && len >= 2 && rng.next() < 0.4) strongroom(m, c, team, rng);
  }
}

/**
 * A strongroom under the bunker: entered down a shaft from its deepest
 * basement (or its ground floor) into an antechamber, then through a steel
 * door into the vault proper, gold stacked along its floor.
 */
function strongroom(m: Uint8Array, c: Complex, team: number, rng: Rng): void {
  const len = c.heights.length;
  const D = Math.max(...c.basements);
  const ks: number[] = [];
  for (let k = 0; k < len; k++) if (c.basements[k] === D) ks.push(k);
  const k = ks[rng.int(ks.length)];
  const wm = Math.min(3, Math.max(k + 1, len - k));
  const dir = k + wm <= len ? 1 : -1;
  const mx = c.x0 + k * MOD_W;
  const vx0 = dir > 0 ? mx : mx + MOD_W - wm * MOD_W;
  const vx1 = vx0 + wm * MOD_W;
  const oy0 = c.floor + SLAB + D * MOD_H;
  const oy1 = oy0 + IRON + STRONGROOM_H + SLAB;
  if (oy1 > WORLD_H - 48) return;
  const fy = oy1 - SLAB; // its floor
  fill(m, vx0, oy0, vx1, fy, Mat.Iron);
  fill(m, vx0, fy, vx1, oy1, Mat.Metal);
  fill(m, vx0 + IRON, oy0 + IRON, vx1 - IRON, fy, Mat.Air);
  // The antechamber under module k, walled off from the vault, the door at the wall's foot.
  const px = (dir > 0 ? mx + MOD_W : mx) - IRON / 2;
  fill(m, px, oy0 + IRON, px + IRON, fy, Mat.Iron);
  const door = { x0: px, y0: fy - DOOR_H, x1: px + IRON, y1: fy, team };
  fill(m, door.x0, door.y0, door.x1, door.y1, Mat.Door);
  c.doors!.push(door);
  // Down into it from above, on the far side from the door.
  const sx = dir > 0 ? mx + IRON + 2 * SCALE : mx + MOD_W - IRON - 2 * SCALE - HOLE_W;
  fill(m, sx, oy0 - SLAB, sx + HOLE_W, oy0 + IRON, Mat.Air);
  // Gold stacked along the vault's floor (beyond the door), and a heavy gun on it.
  const gx0 = dir > 0 ? px + IRON + 4 : vx0 + IRON + 4;
  const gx1 = dir > 0 ? vx1 - IRON - 4 : px - 4;
  let first = true;
  for (let gx = gx0; gx + 8 <= gx1; gx += 14) {
    if (!first && rng.next() < 0.25) continue;
    first = false;
    const h = 4 + rng.int(4) * 2;
    fill(m, gx, fy - h, gx + 8, fy, Mat.Gold);
  }
  const box = { x0: vx0 + IRON, y0: oy0 + IRON, x1: vx1 - IRON, y1: oy1 };
  c.strongroom = box;
  (c.vaults ??= []).push(box);
  const heavy = [WeaponId.Gatling, WeaponId.ATCannon, WeaponId.Autocannon, WeaponId.Laser];
  (c.loot ??= []).push({ x: (gx0 + gx1) >> 1, y: fy - 16, weapon: heavy[rng.int(heavy.length)] });
}

/** The first solid cell down each column. */
function surface(m: Uint8Array): Int32Array {
  const top = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    let y = 0;
    while (y < WORLD_H - 12 && m[y * WORLD_W + x] === Mat.Air) y++;
    top[x] = y;
  }
  return top;
}

/**
 * The works in the open ground around the bunkers (after the sniper towers):
 * sandbags outside the doors and on the roofs, and beyond them trenches,
 * dragon's teeth and iron blocks, each only where the ground is natural and
 * level enough. On a siege map (`siegeSide`: the fortress's end) the
 * defenders' fortress and outposts get them in depth on the side the
 * attackers come from: trench lines, rows of teeth, one after another.
 */
export function fortifyGround(m: Uint8Array, complexes: Complex[], seed: number, siegeSide?: number): Works {
  const rng = new Rng(seed ^ 0x7e3c4);
  const works: Works = { teeth: [], sandbags: [], trenches: [], cubes: [] };
  const top = surface(m);
  // Taken ground: the bunkers and towers (and a margin), then each work as it goes in.
  const taken: [number, number][] = complexes.map((c) => [c.x0 - 20, c.x1 + 20]);
  const free = (a: number, b: number) => a > 100 && b < WORLD_W - 100 && taken.every(([t0, t1]) => b < t0 || a > t1);
  /** Natural ground across [a, b), within `tol` of level; its median height, or -1. */
  const site = (a: number, b: number, tol: number): number => {
    if (!free(a, b)) return -1;
    let lo = WORLD_H;
    let hi = 0;
    for (let x = a; x < b; x++) {
      const y = top[x];
      const v = m[y * WORLD_W + x];
      if (!isSoil(v) && v !== Mat.Rock) return -1;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    if (hi - lo > tol || lo < 60 || hi > WORLD_H - 80) return -1;
    return hi;
  };
  const take = (a: number, b: number) => taken.push([a - 6, b + 6]);

  for (const c of complexes) {
    if (c.tower) continue;
    // Sandbags on a roof or two.
    for (let k = 0; k < c.heights.length; k++) {
      if (rng.next() > 0.3) continue;
      const roof = c.floor - c.heights[k] * MOD_H;
      const x = c.x0 + k * MOD_W + 12 + rng.int(MOD_W - 40);
      if (m[(roof - 1) * WORLD_W + x] !== Mat.Air || m[(roof - 1) * WORLD_W + x + 16] !== Mat.Air) continue; // (a merlon)
      works.sandbags.push(bags(m, x, roof, 16, BAGS_H, rng));
    }
    for (const dir of [-1, 1]) {
      const end = dir < 0 ? c.x0 : c.x1;
      // Sandbags outside the door.
      if (rng.next() < 0.55) {
        const w = 18 + rng.int(8);
        const a = dir < 0 ? end - 24 - 14 - w - rng.int(16) : end + 24 + 14 + rng.int(16);
        const g = site(a, a + w, 6);
        if (g > 0) {
          works.sandbags.push(bags(m, a, g, w, BAGS_H, rng));
          take(a, a + w);
        }
      }
      // Further out: a trench, a row of dragon's teeth, an iron block.
      let at = end + dir * (70 + rng.int(40));
      const front = siegeSide !== undefined && (c.fortress || c.owner !== undefined) && dir === (siegeSide === 0 ? 1 : -1);
      for (const kind of front ? [0, 1, 0, 1, 2, 1] : [0, 1, 2]) {
        if (rng.next() > (front ? 1 : c.fortress ? 0.95 : 0.6)) continue;
        const n = 3 + rng.int(3); // teeth in the row
        const s = 16 + rng.int(4) * 2; // an iron block's size
        const len = kind === 0 ? 44 + rng.int(32) : kind === 1 ? n * TOOTH_W + (n - 1) * TOOTH_GAP : s;
        const sink = 4 + rng.int(4);
        // (Edging further out until the ground suits.)
        for (let tries = 0; tries < 8; tries++, at += dir * 24) {
          const a = dir < 0 ? at - len : at;
          const g = kind === 0 ? site(a - 4, a + len + 4, 12) : site(a, a + len, kind === 1 ? 14 : 8);
          if (g < 0) continue;
          if (kind === 0) works.trenches.push(trench(m, a, a + len, g, dir, rng));
          else if (kind === 1) for (let i = 0; i < n; i++) works.teeth.push(tooth(m, a + i * (TOOTH_W + TOOTH_GAP), top));
          else {
            fill(m, a, g + sink - s, a + s, g + sink, Mat.Iron);
            works.cubes.push({ x0: a, y0: g + sink - s, x1: a + s, y1: g + sink });
          }
          take(a, a + len);
          at += dir * (len + 24 + rng.int(30));
          break;
        }
      }
    }
  }
  return (lastWorks = works);
}

/** A sandbag pile `w` wide on the surface `g` (bags in courses, the top course stepped in). */
function bags(m: Uint8Array, x: number, g: number, w: number, h: number, rng: Rng): Box {
  for (let i = 0; i < w; i++) {
    const edge = Math.min(i, w - 1 - i);
    const hh = Math.min(h, 4 + edge * 3) - (rng.next() < 0.15 ? 1 : 0);
    fill(m, x + i, g - hh, x + i + 1, g + 1, Mat.Sandbag);
  }
  return { x0: x, y0: g - h, x1: x + w, y1: g };
}

/** A concrete pyramid sunk in the ground at `x` (the surface under each column from `top`). */
function tooth(m: Uint8Array, x: number, top: Int32Array): Box {
  let base = 0;
  for (let i = 0; i < TOOTH_W; i++) base = Math.max(base, top[x + i]);
  const peak = base - TOOTH_H;
  for (let i = 0; i < TOOTH_W; i++) {
    const d = Math.abs(2 * i + 1 - TOOTH_W); // 1 at the middle, TOOTH_W-1 at the edges
    // A pyramid's top on sheer sides (18 high: too tall for a tank's tracks, even off a bounce).
    const h = TOOTH_H - Math.floor((d * 6) / (TOOTH_W - 1));
    fill(m, x + i, base - h, x + i + 1, base + 4, Mat.Concrete);
  }
  return { x0: x, y0: peak, x1: x + TOOTH_W, y1: base };
}

/**
 * A trench across [a, b) with its lip at `g`, facing `dir`: steps down at the
 * back, the pit, a step up and the fire step against the front wall, and
 * sandbags heaped on the back lip.
 */
function trench(m: Uint8Array, a: number, b: number, g: number, dir: number, rng: Rng): Trench {
  const floor = g + TRENCH_D;
  const stepY = g + STEP_D;
  // Clear everything above the pit floor (and level the lip).
  fill(m, a, g - 16, b, floor, Mat.Air);
  // The ground under it and its walls stay; a firm floor (rammed earth).
  for (let x = a; x < b; x++) for (let y = floor; y < floor + 3; y++) if (m[y * WORLD_W + x] === Mat.Air || m[y * WORLD_W + x] === Mat.Sand || m[y * WORLD_W + x] === Mat.RustSand) m[y * WORLD_W + x] = Mat.Dirt;
  // Walls back to the lip either side (where the ground dipped below it).
  for (const [x0, x1] of [
    [a - 4, a],
    [b, b + 4],
  ]) {
    for (let x = x0; x < x1; x++) for (let y = g; y < floor + 3; y++) if (m[y * WORLD_W + x] === Mat.Air) m[y * WORLD_W + x] = Mat.Dirt;
  }
  const front = dir > 0 ? b : a;
  const back = dir > 0 ? a : b;
  // The fire step against the front wall, a half step up to it.
  const STEP_W = 14;
  const HALF_W = 6;
  const fs0 = dir > 0 ? front - STEP_W : front;
  fill(m, fs0, stepY, fs0 + STEP_W, floor, Mat.Dirt);
  const hs0 = dir > 0 ? fs0 - HALF_W : fs0 + STEP_W;
  fill(m, hs0, stepY + 4, hs0 + HALF_W, floor, Mat.Dirt);
  // Steps out at the back, four cells a stair.
  const stairs = Math.floor((TRENCH_D - 1) / 4);
  for (let s = 1; s <= stairs; s++) {
    const sx = dir > 0 ? back + (stairs - s) * 4 : back - (stairs - s + 1) * 4;
    fill(m, sx, floor - s * 4, sx + 4, floor, Mat.Dirt);
  }
  // A low heap of sandbags on the back lip (the parados).
  if (rng.next() < 0.7) {
    const w = 12;
    const px = dir > 0 ? back - w : back;
    for (let i = 0; i < w; i++) {
      const hh = Math.min(5, 2 + Math.min(i, w - 1 - i) * 2);
      fill(m, px + i, g - hh, px + i + 1, g, Mat.Sandbag);
    }
  }
  return { x0: a, x1: b, ground: g, dir, step: { x0: fs0, y0: stepY, x1: fs0 + STEP_W, y1: stepY }, floor };
}
