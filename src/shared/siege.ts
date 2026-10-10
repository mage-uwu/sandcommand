import { WORLD_W } from './constants.ts';
import { Team } from './protocol.ts';
import { Rng } from './rng.ts';
import { type Complex, type FortPlan, MOD_W, Style, TOWER_W, buildComplex, markBackdrop, markBox, Backdrop, WALL, SLAB, MOD_H, tower } from './structures.ts';

/**
 * Siege: one side holds a massive fortress at one end of the map, with
 * outposts strung out in front of it; the other comes in from the far end,
 * through a narrow landing zone, and has to fight its way across.
 *
 * - The **fortress**: twelve modules, up to four storeys, three basements,
 *   the king's vault at the bottom of its deepest, steel doors at its gates
 *   and inside it (fortifications.ts), slabs on its walls.
 * - Three **outposts** (fortified bunkers, the defenders' doors) and two
 *   sniper towers between it and the landing zone, the ground around them
 *   thick with trenches, dragon's teeth and sandbags.
 * - The attackers' **landing zone**: a 400-cell strip near the far end.
 *   Every one of them comes down there, so every one of them has the whole
 *   gap to close.
 *
 * Defenders are red, attackers green. Which end the fortress is at comes
 * from the seed. Integer arithmetic and the seeded Rng, like the rest of
 * the map, so clients build the same thing.
 */

export const DEFENDERS = Team.Red;
export const ATTACKERS = Team.Green;
/** The attackers' lives, shared: every death spends one, and at none left the dead stay dead. */
export const SIEGE_LIVES = 300;
/** How long the defenders have to hold (ticks: ten minutes). */
export const SIEGE_TICKS = 30 * 60 * 10;

const MARGIN = 96;
/** The fortress: its first module (from its own end), storeys and basements outward from that end; the king's vault module. */
const FORT_INSET = 2;
const FORT_STOREYS = [2, 3, 3, 2, 3, 4, 4, 3, 2, 3, 3, 2];
const FORT_BASEMENTS = [1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1];
const FORT_VAULT = 5;
/** Outposts: their first module (counted from the fortress's end) and length. */
const OUTPOSTS: readonly [number, number][] = [
  [17, 3],
  [24, 2],
  [31, 2],
];
/** Sniper towers (cell offsets from the fortress's end). */
const TOWERS = [1450, 1880];
/** The landing zone: its near edge (from the fortress's end) and width. */
const LZ_AT = 2860;
const LZ_W = 400;

export interface SiegeMap {
  /** Which end the fortress is at: 0 west, 1 east. */
  side: number;
  /** The fortress, the outposts' spans, and the attackers' landing zone (cells). */
  fort: [number, number];
  outposts: [number, number][];
  lz: [number, number];
  /** Where each side's tanks and watchdogs stand at the start (x, cells). */
  defTanks: number[];
  defDogs: number[];
  atkTanks: number[];
  atkDogs: number[];
}

/** Which end the fortress is at, from the seed. */
export const siegeSide = (seed: number) => ((seed >>> 7) ^ (seed >>> 19)) & 1;

/** An x measured from the fortress's end (for the east end, from the east edge). */
const fromEnd = (side: number, d: number, w = 0) => (side === 0 ? d : WORLD_W - d - w);

/** Spans [x0, x1) to level before the terrain is filled (the fortress, outposts, towers, and the landing zone), with how hard to level them (0..1). */
export function siegeSites(seed: number): { x0: number; x1: number; k: number }[] {
  const side = siegeSide(seed);
  const out: { x0: number; x1: number; k: number }[] = [];
  const span = (d: number, w: number, k: number) => {
    const x0 = fromEnd(side, d, w);
    out.push({ x0, x1: x0 + w, k });
  };
  span(MARGIN + FORT_INSET * MOD_W - 40, FORT_STOREYS.length * MOD_W + 80, 1);
  for (const [i, len] of OUTPOSTS) span(MARGIN + i * MOD_W - 24, len * MOD_W + 48, 0.9);
  for (const d of TOWERS) span(d - TOWER_W, TOWER_W * 2, 0.8);
  span(LZ_AT, LZ_W, 0.6);
  return out;
}

/** Build the siege map's fortress, outposts and towers into `m`. */
export function placeSiege(m: Uint8Array, heights: Int32Array, seed: number, backdrop?: Uint8Array): { complexes: Complex[]; map: SiegeMap } {
  const side = siegeSide(seed);
  const rng = new Rng(seed ^ 0x51e6e);
  const out: Complex[] = [];
  const len = FORT_STOREYS.length;
  const fx0 = fromEnd(side, MARGIN + FORT_INSET * MOD_W, len * MOD_W);
  const plan: FortPlan = {
    storeys: side === 0 ? FORT_STOREYS : [...FORT_STOREYS].reverse(),
    basements: side === 0 ? FORT_BASEMENTS : [...FORT_BASEMENTS].reverse(),
    vault: side === 0 ? FORT_VAULT : len - 1 - FORT_VAULT,
    team: DEFENDERS,
  };
  const fort = buildComplex(m, heights, fx0, len, rng, plan);
  if (fort) out.push(fort);
  const outposts: [number, number][] = [];
  for (const [i, olen] of OUTPOSTS) {
    const x0 = fromEnd(side, MARGIN + i * MOD_W, olen * MOD_W);
    let c: Complex | null = null;
    for (let tries = 0; tries < 3 && !c; tries++) c = buildComplex(m, heights, x0, olen, rng, undefined, Style.Fortified, 2);
    if (!c) continue;
    c.owner = DEFENDERS;
    out.push(c);
    outposts.push([c.x0, c.x1]);
    // Its rooms are the defenders' posts too.
    if (fort?.fortress) {
      for (let k = 0; k < olen; k++) fort.fortress.spawns.push({ x: c.x0 + k * MOD_W + MOD_W / 2, y: c.floor });
    }
  }
  for (const d of TOWERS) {
    const tw = tower(m, heights, fromEnd(side, d), rng);
    if (!tw) continue;
    tw.owner = DEFENDERS;
    out.push(tw);
    if (backdrop) markBox(backdrop, tw.x0 + WALL, tw.floor - tw.heights[0] * MOD_H + SLAB, tw.x1 - WALL, tw.floor, Backdrop.Concrete);
  }
  out.sort((a, b) => a.x0 - b.x0);
  if (backdrop) for (const c of out) if (!c.tower) markBackdrop(backdrop, c);
  const lz0 = fromEnd(side, LZ_AT, LZ_W);
  // Vehicles: the defenders' outside the fortress's gate and among the outposts; the attackers' across the landing zone.
  const gate = fort ? (side === 0 ? fort.x1 : fort.x0) : fromEnd(side, 900);
  const out1 = side === 0 ? 1 : -1;
  const map: SiegeMap = {
    side,
    fort: fort ? [fort.x0, fort.x1] : [fx0, fx0 + len * MOD_W],
    outposts,
    lz: [lz0, lz0 + LZ_W],
    defTanks: [gate + out1 * 70, ...outposts.slice(0, 2).map(([a, b]) => (side === 0 ? b + 60 : a - 92))],
    defDogs: [gate + out1 * 130, ...outposts.map(([a, b]) => (side === 0 ? b + 120 : a - 140))],
    atkTanks: [lz0 + 70, lz0 + 190, lz0 + 310],
    atkDogs: [lz0 + 40, lz0 + 130, lz0 + 250, lz0 + 350],
  };
  // (Never inside a bunker or a tower: stepped clear of them, away from the fortress.)
  const clear = (x: number) => {
    for (let n = 0; n < 20; n++) {
      const hit = out.find((c) => x + 40 > c.x0 - 12 && x < c.x1 + 12);
      if (!hit) break;
      x = side === 0 ? hit.x1 + 14 : hit.x0 - 54;
    }
    return x;
  };
  for (const list of [map.defTanks, map.defDogs]) for (let i = 0; i < list.length; i++) list[i] = clear(list[i]);
  // (Nor on top of each other.)
  const taken = [...map.defTanks];
  for (let i = 0; i < map.defDogs.length; i++) {
    let x = map.defDogs[i];
    for (let n = 0; n < 6 && taken.some((t) => Math.abs(t - x) < 46); n++) x = clear(x + (side === 0 ? 50 : -50));
    map.defDogs[i] = x;
    taken.push(x);
  }
  return { complexes: out, map };
}
