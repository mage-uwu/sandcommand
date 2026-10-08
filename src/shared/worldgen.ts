import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { Terrain } from './terrain.ts';
import { type Complex, placeStructures } from './structures.ts';
import { DUNGEON_SURFACE, type Dungeon, generateDungeon } from './dungeon.ts';

/** The bunker complexes of the most recently generated map (tests, spawning). */
export let lastComplexes: Complex[] = [];
/** The labyrinth of the most recently generated map, if it is an Extraction map. */
export let lastDungeon: Dungeon | null = null;

/** What kind of map to make: the usual bunkers, Regicide's two fortresses, or Extraction's labyrinth. */
export const MapKind = {
  Plain: 0,
  Fortress: 1,
  Dungeon: 2,
} as const;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1). */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const k = 1 / 4294967296;
  const a = hash2(ix, iy, seed) * k;
  const b = hash2(ix + 1, iy, seed) * k;
  const c = hash2(ix, iy + 1, seed) * k;
  const d = hash2(ix + 1, iy + 1, seed) * k;
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(x: number, y: number, scale: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y, scale, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  return sum / norm;
}

/**
 * fbm() for one noise layer, with each octave's four lattice-corner hashes
 * cached: walking a row, consecutive cells almost always share them, so most
 * lookups skip hashing. Same arithmetic as fbm(), so identical results.
 */
class Fbm {
  private readonly scales: Float64Array;
  private readonly seeds: Int32Array;
  private readonly ix: Float64Array;
  private readonly iy: Float64Array;
  private readonly corners: Float64Array;
  constructor(scale: number, seed: number, octaves: number) {
    this.scales = new Float64Array(octaves);
    this.seeds = new Int32Array(octaves);
    for (let o = 0; o < octaves; o++) {
      this.scales[o] = scale;
      this.seeds[o] = seed + o * 1013;
      scale *= 0.5;
    }
    this.ix = new Float64Array(octaves).fill(NaN);
    this.iy = new Float64Array(octaves).fill(NaN);
    this.corners = new Float64Array(octaves * 4);
  }
  at(x: number, y: number): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    const k = 1 / 4294967296;
    const c = this.corners;
    for (let o = 0; o < this.scales.length; o++) {
      const fx = x / this.scales[o];
      const fy = y / this.scales[o];
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const j = o * 4;
      if (ix !== this.ix[o] || iy !== this.iy[o]) {
        const seed = this.seeds[o];
        c[j] = hash2(ix, iy, seed) * k;
        c[j + 1] = hash2(ix + 1, iy, seed) * k;
        c[j + 2] = hash2(ix, iy + 1, seed) * k;
        c[j + 3] = hash2(ix + 1, iy + 1, seed) * k;
        this.ix[o] = ix;
        this.iy[o] = iy;
      }
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const a = c[j];
      const b = c[j + 1];
      const cc = c[j + 2];
      const d = c[j + 3];
      sum += (a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

/**
 * Procedural generation. The server makes each wave's map with it, and
 * clients make the same map from the same seed instead of downloading it.
 * It uses floating-point trig, which engines may round differently, so the
 * server also sends every chunk's hash and clients ask again for any chunk
 * that came out different.
 */
/**
 * `fortresses`: build the two Regicide fortresses into the map as well.
 * `backdrop` (clients only, WORLD_W x WORLD_H): filled with the bunkers' back walls.
 */
export function generateWorld(t: Terrain, seed: number, kind: number | boolean = MapKind.Plain, backdrop?: Uint8Array): void {
  const mapKind = kind === true ? MapKind.Fortress : kind === false ? MapKind.Plain : kind;
  const dungeon = mapKind === MapKind.Dungeon;
  const rng = new Rng(seed);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const p3 = rng.range(0, Math.PI * 2);
  const heights = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    // An Extraction desert sits high (the labyrinth under it is deep) and flatter.
    const amp = dungeon ? 0.25 : 1;
    const h =
      (dungeon ? DUNGEON_SURFACE : WORLD_H * 0.36) +
      (Math.sin(x * 0.0041 + p1) * 70 +
        Math.sin(x * 0.011 + p2) * 28 +
        Math.sin(x * 0.031 + p3) * 7 +
        (fbm(x, 0, 96, seed ^ 0x51, 3) - 0.5) * 60) *
        amp;
    heights[x] = Math.floor(h);
  }

  // Dunes: the sand crust thickens to tens of cells in places (one value per column).
  const dune = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) dune[x] = 10 + Math.max(0, fbm(x, 0, 160, seed ^ 0x77, 2) - 0.45) * 160;

  const caves = new Fbm(64, seed ^ 0xc3, 3);
  const gold = new Fbm(14, seed ^ 0xb7, 2);
  const rock = new Fbm(48, seed ^ 0xa1, 3);
  const lenses = new Fbm(40, seed ^ 0x5a, 3);
  const m = t.mat;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let v: number = Mat.Air;
      const surf = heights[x];
      if (y >= surf) {
        const depth = y - surf;
        // Highest priority first, stopping at the first that applies, so
        // most cells cost one or two noise lookups:
        // caves (widening with depth) > gold veins > rock > buried sand
        // lenses (loose pockets that cave in when undercut) > sand / dirt.
        if (depth > 30 && caves.at(x, y) > 0.69 - Math.min(depth, 400) / 4000) v = Mat.Air;
        else if (depth > 50 && gold.at(x, y) > 0.8 - Math.min(depth, 500) / 6000) v = Mat.Gold;
        else if (depth > 6 && rock.at(x, y) > 0.66) v = Mat.Rock;
        else if (depth > 25 && lenses.at(x, y) > 0.7) v = Mat.Sand;
        else v = depth < dune[x] ? Mat.Sand : Mat.Dirt;
      }
      if (y >= WORLD_H - 12 || x < 4 || x >= WORLD_W - 4) v = Mat.Bedrock;
      m[y * WORLD_W + x] = v;
    }
  }
  // Bunker complexes on a modular grid across part of the surface.
  backdrop?.fill(0);
  if (dungeon) {
    lastComplexes = [];
    lastDungeon = generateDungeon(m, heights, seed, backdrop);
  } else {
    lastComplexes = placeStructures(m, heights, seed, mapKind === MapKind.Fortress, backdrop);
    lastDungeon = null;
  }
  t.rebuildAllPlanes();
  // Start stable: loose material generated over a cave would collapse the
  // moment anything touched it, so give it a cohesive dirt crust instead.
  // Bottom-up, so each crust cell supports the column above it.
  t.detachUnsupported(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => t.set(x, y, Mat.Dirt));
}
