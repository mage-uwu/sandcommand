import { WORLD_H, WORLD_W } from './constants.ts';
import { MAT_LOOSE, Mat, isSoil } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { Terrain } from './terrain.ts';
import { Backdrop, type Complex, markBox, placeStructures } from './structures.ts';
import { fortifyComplexes, fortifyGround, lastWorks } from './fortifications.ts';
import { type SiegeMap, placeSiege, siegeSites } from './siege.ts';
import { DUNGEON_SURFACE, type Dungeon, generateDungeon } from './dungeon.ts';
import { type CaveNet, carveCaves, dripCaves } from './caves.ts';
import { placeRareEarth } from './rare-earth.ts';
import { type Crater, type Flora, type GemCavern, type GeyserSite, placeCraters, placeFlora, placeGemCaverns, placeGeysers, relineCraters } from './frosting.ts';

/** The bunker complexes of the most recently generated map (tests, spawning). */
export let lastComplexes: Complex[] = [];
/** The labyrinth of the most recently generated map, if it is an Extraction map. */
export let lastDungeon: Dungeon | null = null;
/** The cave network of the most recently generated map, if it is a cave map. */
export let lastCaves: CaveNet | null = null;
/** The last siege map's layout (its fortress's end, outposts, landing zone, vehicle spots), or null. */
export let lastSiege: SiegeMap | null = null;

/**
 * Is this a cave map (caves.ts: a tunnel highway under the bunkers, with
 * citadels in great caverns along it)? About two maps in five, ordinary or
 * Regicide's; never the labyrinth (it's underground already).
 */
export function cavesOf(seed: number, kind: number): boolean {
  if (kind === MapKind.Dungeon) return false;
  return hash2(seed & 0xffff, seed >>> 16, 0xca7e) % 100 < 40;
}

/**
 * Biomes: the lie of the land, picked per map from its seed.
 * - Dunes: rolling desert, a thick sand crust (the original).
 * - Canyons: a high, flat rock plateau split by deep ravines, layered walls,
 *   sandy riverbeds, natural rock bridges over some of them.
 * - Highlands: steep ridged mountains, rock near the surface, snow on the peaks.
 * - Meadows: gentle green hills, thin sand, grass nearly everywhere.
 */
export const Biome = { Dunes: 0, Canyons: 1, Highlands: 2, Meadows: 3 } as const;
export const BIOME_NAMES = ['Dunes', 'Canyons', 'Highlands', 'Meadows'] as const;
/** The biome of the most recently generated map. */
export let lastBiome: number = Biome.Dunes;
/** The most recently generated map's frosting (frosting.ts): craters, gem caverns, geysers, and where the flora grows. */
export let lastCraters: Crater[] = [];
export let lastGemCaverns: GemCavern[] = [];
export let lastGeysers: GeyserSite[] = [];
export let lastFlora: Flora[] = [];

/** Which biome a map gets: any for an ordinary map; fortresses want gentle ground; the labyrinth is under a desert. */
export function biomeOf(seed: number, kind: number): number {
  const r = (hash2(seed & 0xffff, seed >>> 16, 0x6b10) >>> 0) / 4294967296;
  if (kind === MapKind.Dungeon) return Biome.Dunes;
  if (kind === MapKind.Fortress || kind === MapKind.Siege) return r < 0.5 ? Biome.Dunes : Biome.Meadows;
  return Math.min(3, Math.floor(r * 4));
}

/** What kind of map to make: the usual bunkers, Regicide's two fortresses, or Extraction's labyrinth. */
export const MapKind = {
  Plain: 0,
  Fortress: 1,
  Dungeon: 2,
  /** Siege: one massive fortress and its outposts at one end, the attackers' landing zone at the other (siege.ts). */
  Siege: 3,
} as const;

/** Level each span to its median height (by `k`), easing back into the land over 160 cells either side. */
function levelSites(heights: Int32Array, sites: { x0: number; x1: number; k: number }[]): void {
  const EASE = 160;
  for (const st of sites) {
    const hs: number[] = [];
    for (let x = Math.max(0, st.x0); x < Math.min(WORLD_W, st.x1); x += 4) hs.push(heights[x]);
    if (!hs.length) continue;
    hs.sort((a, b) => a - b);
    // (Deep enough under the sky for a four-storey keep.)
    const level = Math.max(260, hs[hs.length >> 1]);
    for (let x = Math.max(0, st.x0 - EASE); x < Math.min(WORLD_W, st.x1 + EASE); x++) {
      const d = x < st.x0 ? st.x0 - x : x >= st.x1 ? x - st.x1 + 1 : 0;
      const u = 1 - d / EASE;
      const w = st.k * u * u * (3 - 2 * u);
      heights[x] = Math.round(heights[x] * (1 - w) + level * w);
    }
  }
}

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
 * Which soil a cell of ground is, from the soil noise `n` (0..1), its depth
 * under the surface and its row: mostly rust-red dirt; ochre where the
 * noise runs high near the surface, oxblood clay where it runs high deeper
 * down and in thin wavy bands; dark regolith where it runs low, and more of
 * it the deeper you dig.
 */
function soilAt(n: number, depth: number, y: number): number {
  if (depth < 90 ? n > 0.61 : n > 0.66) return depth < 90 ? Mat.Ochre : Mat.Clay;
  if (n < 0.26 + Math.min(depth, 400) / 3000) return depth > 10 ? Mat.Regolith : Mat.Dirt;
  if (depth > 20 && ((y + Math.floor(n * 22)) % 41) < 3) return Mat.Clay;
  return Mat.Dirt;
}

/**
 * Frosting on the natural ground (never on bunkers): patches of grass turf on
 * gentle slopes (sparse in the desert, nearly everywhere on the meadows),
 * and snow capping the Highlands' peaks.
 */
function frost(m: Uint8Array, biome: number, seed: number): void {
  const top = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    let y = 0;
    while (y < WORLD_H - 12 && m[y * WORLD_W + x] === Mat.Air) y++;
    top[x] = y;
  }
  const patch = new Fbm(110, seed ^ 0x6a55, 3);
  const cover = [0.66, 0.6, 0.52, 0.3][biome]; // grass where the patch noise is above this
  const snowline = WORLD_H * 0.3;
  for (let x = 6; x < WORLD_W - 6; x++) {
    const y = top[x];
    const mat = m[y * WORLD_W + x];
    if (!isSoil(mat) && mat !== Mat.Rock) continue; // natural ground only
    const slope = Math.abs(top[x + 3] - top[x - 3]) / 6;
    const h = (hash2(x, y, seed ^ 0x5eed) >>> 0) / 4294967296;
    if (biome === Biome.Highlands && y < snowline + patch.at(x, 3) * 50) {
      // Snow on the peaks, deeper on the gentler slopes.
      const depth = (slope < 1.5 ? 4 : 2) + Math.floor(h * 3);
      for (let k = 0; k < depth; k++) if (m[(y + k) * WORLD_W + x] !== Mat.Air) m[(y + k) * WORLD_W + x] = Mat.Snow;
      continue;
    }
    if (slope > 1.3 || mat === Mat.Rock || patch.at(x, 0) < cover) continue;
    // A turf two or three cells deep, on soil (a little dirt under it if it's on sand).
    const depth = 2 + Math.floor(h * 2);
    for (let k = 0; k < depth; k++) m[(y + k) * WORLD_W + x] = Mat.Grass;
    for (let k = depth; k < depth + 2; k++) if (MAT_LOOSE[m[(y + k) * WORLD_W + x]]) m[(y + k) * WORLD_W + x] = Mat.Dirt;
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
  const biome = biomeOf(seed, mapKind);
  lastBiome = biome;
  const rng = new Rng(seed);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const p3 = rng.range(0, Math.PI * 2);
  const heights = new Int32Array(WORLD_W);
  // Canyons: the plateau's ravines (centre, half-width, depth), and which get a rock bridge.
  const ravines: { x: number; w: number; d: number; bridge: boolean }[] = [];
  if (biome === Biome.Canyons) {
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      ravines.push({
        x: Math.floor(((i + 0.5) / n) * WORLD_W + rng.range(-0.18, 0.18) * (WORLD_W / n)),
        w: 45 + rng.int(75),
        d: 170 + rng.int(170),
        bridge: rng.next() < 0.5,
      });
    }
  }
  for (let x = 0; x < WORLD_W; x++) {
    let h: number;
    if (biome === Biome.Highlands) {
      // Ridged noise: sharp peaks and deep valleys.
      const n = fbm(x, 0, 520, seed ^ 0x91, 4);
      const ridge = Math.pow(1 - Math.abs(n * 2 - 1), 2.2);
      h = WORLD_H * 0.5 - ridge * 330 + Math.sin(x * 0.011 + p2) * 18 + (fbm(x, 0, 60, seed ^ 0x51, 3) - 0.5) * 44;
    } else if (biome === Biome.Canyons) {
      h = WORLD_H * 0.3 + Math.sin(x * 0.004 + p1) * 18 + (fbm(x, 0, 80, seed ^ 0x51, 3) - 0.5) * 14;
      for (const rv of ravines) {
        const u = Math.abs(x - rv.x) / rv.w;
        if (u >= 1) continue;
        // Steep walls over the outer third, a flat floor, a little jagged.
        const cut = rv.d * Math.min(1, (1 - u) * 3) + (fbm(x, 7, 18, seed ^ 0x33, 2) - 0.5) * 16;
        h = Math.max(h, WORLD_H * 0.3 + cut);
      }
    } else if (biome === Biome.Meadows) {
      h = WORLD_H * 0.38 + Math.sin(x * 0.003 + p1) * 55 + Math.sin(x * 0.009 + p2) * 22 + (fbm(x, 0, 120, seed ^ 0x51, 3) - 0.5) * 30;
    } else {
      // An Extraction desert sits high (the labyrinth under it is deep) and flatter.
      const amp = dungeon ? 0.25 : 1;
      h =
        (dungeon ? DUNGEON_SURFACE : WORLD_H * 0.36) +
        (Math.sin(x * 0.0041 + p1) * 70 + Math.sin(x * 0.011 + p2) * 28 + Math.sin(x * 0.031 + p3) * 7 + (fbm(x, 0, 96, seed ^ 0x51, 3) - 0.5) * 60) * amp;
    }
    heights[x] = Math.max(80, Math.min(WORLD_H - 70, Math.floor(h)));
  }
  // Siege: level the fortress's site (and its outposts', towers' and the landing zone), easing into the land around.
  if (mapKind === MapKind.Siege) levelSites(heights, siegeSites(seed));

  // The sand crust: thick dunes in the desert, a dusting on the meadows, none
  // up the mountains or on the plateau (one value per column).
  const dune = new Float64Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const n = fbm(x, 0, 160, seed ^ 0x77, 2);
    dune[x] =
      biome === Biome.Dunes ? 10 + Math.max(0, n - 0.45) * 160 : biome === Biome.Meadows ? 2 + Math.max(0, n - 0.6) * 40 : 0;
  }
  const rockBias = biome === Biome.Highlands ? 0.09 : biome === Biome.Canyons ? 0.04 : 0;
  const canyonFloor = WORLD_H * 0.3 + 40;

  const caves = new Fbm(64, seed ^ 0xc3, 3);
  const gold = new Fbm(14, seed ^ 0xb7, 2);
  const rock = new Fbm(48, seed ^ 0xa1, 3);
  const lenses = new Fbm(40, seed ^ 0x5a, 3);
  // The soil's varieties: ochre pockets near the surface, oxblood clay
  // deeper and in bands, dark regolith in patches and the deep.
  const soil = new Fbm(70, seed ^ 0x3d, 2);
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
        else if (depth > (rockBias ? 2 : 6) && rock.at(x, y) > 0.66 - rockBias) v = Mat.Rock;
        else if (biome === Biome.Canyons && surf > canyonFloor && depth < 6) v = Mat.Sand; // a sandy riverbed
        else if (biome === Biome.Canyons && ((y + Math.floor(rock.at(x, 0) * 8)) / 13 | 0) % 3 === 0) v = Mat.Rock; // layered walls
        else if (depth > 25 && lenses.at(x, y) > 0.7) v = Mat.Sand;
        else if (depth < dune[x]) v = Mat.RustSand; // the dunes: rust dust
        else v = soilAt(soil.at(x, y), depth, y);
      }
      if (y >= WORLD_H - 12 || x < 4 || x >= WORLD_W - 4) v = Mat.Bedrock;
      m[y * WORLD_W + x] = v;
    }
  }
  // Canyons: natural rock bridges arching over some ravines, a little below the rim.
  for (const rv of ravines) {
    if (!rv.bridge) continue;
    const by = Math.floor(WORLD_H * 0.3) + 18 + rng.int(30);
    for (let x = rv.x - rv.w; x <= rv.x + rv.w; x++) {
      if (x < 4 || x >= WORLD_W - 4) continue;
      const u = (x - rv.x) / rv.w;
      const thick = 7 + Math.round(10 * u * u); // thicker where it meets the walls
      for (let y = by; y < by + thick; y++) if (m[y * WORLD_W + x] === Mat.Air) m[y * WORLD_W + x] = Mat.Rock;
    }
  }
  // Bunker complexes on a modular grid across part of the surface.
  backdrop?.fill(0);
  lastSiege = null;
  if (dungeon) {
    lastComplexes = [];
    lastDungeon = generateDungeon(m, heights, seed, backdrop);
  } else if (mapKind === MapKind.Siege) {
    const sg = placeSiege(m, heights, seed, backdrop);
    lastComplexes = sg.complexes;
    lastSiege = sg.map;
    fortifyComplexes(m, lastComplexes, seed);
    if (backdrop) for (const c of lastComplexes) if (c.strongroom) markBox(backdrop, c.strongroom.x0, c.strongroom.y0, c.strongroom.x1, c.strongroom.y1, Backdrop.Steel);
    lastDungeon = null;
  } else {
    const extraTowers = biome === Biome.Highlands ? 5 : biome === Biome.Canyons ? 2 : 0;
    lastComplexes = placeStructures(m, heights, seed, mapKind === MapKind.Fortress, backdrop, extraTowers);
    // Their doors, slabs and strongrooms.
    fortifyComplexes(m, lastComplexes, seed);
    if (backdrop) for (const c of lastComplexes) if (c.strongroom) markBox(backdrop, c.strongroom.x0, c.strongroom.y0, c.strongroom.x1, c.strongroom.y1, Backdrop.Steel);
    lastDungeon = null;
  }
  // Cave maps: the highway under it all, its citadels, and the shafts down to it from every bunker.
  lastCaves = cavesOf(seed, mapKind) ? carveCaves(m, heights, seed, lastComplexes, backdrop) : null;
  // The works in the ground around the bunkers (trenches, dragon's teeth, sandbags, iron blocks).
  if (!dungeon) fortifyGround(m, lastComplexes, seed, lastSiege?.side);
  if (lastCaves) lastComplexes = [...lastComplexes, ...lastCaves.citadels].sort((a, b) => a.x0 - b.x0);
  // The frosting: impact craters, gem caverns and geyser vents (not over the
  // labyrinth), clear of every bunker and the siege works.
  const spans: { x0: number; x1: number }[] = lastComplexes.map((c) => ({ x0: c.x0, x1: c.x1 }));
  if (lastSiege) spans.push({ x0: lastSiege.lz[0], x1: lastSiege.lz[1] });
  // (And the works dug in round the bunkers: trenches, teeth, sandbags, iron blocks.)
  if (!dungeon) for (const list of [lastWorks.trenches, lastWorks.teeth, lastWorks.sandbags, lastWorks.cubes]) for (const w of list) spans.push({ x0: w.x0, x1: w.x1 });
  lastCraters = dungeon ? [] : placeCraters(m, seed, spans);
  lastGemCaverns = dungeon ? [] : placeGemCaverns(m, seed, spans);
  lastGeysers = dungeon ? [] : placeGeysers(m, seed, spans, lastCraters);
  // Stalactites and stalagmites through the natural caves.
  if (!dungeon) dripCaves(m, heights, seed);
  // Rare earth crystals, deep in the natural ground.
  placeRareEarth(m, heights, seed);
  frost(m, biome, seed);
  relineCraters(m, lastCraters);
  // (The flora last: it grows on the ground as it ends up, frosting and all.)
  lastFlora = placeFlora(m, seed, biome, lastGeysers, spans);
  t.rebuildAllPlanes();
  // Start stable: loose material generated over a cave would collapse the
  // moment anything touched it, so give it a cohesive dirt crust instead.
  // Bottom-up, so each crust cell supports the column above it.
  t.detachUnsupported(0, 0, WORLD_W - 1, WORLD_H - 1, (x, y) => t.set(x, y, Mat.Dirt));
}
