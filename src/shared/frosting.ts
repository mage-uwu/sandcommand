import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat, isDeadGround, isSoil } from './materials.ts';
import { PK, type Particles } from './particles.ts';
import { Rng } from './rng.ts';

/**
 * The planet's frosting, grown into each map after the bunkers and caves
 * (seeded and integer like the rest of worldgen, so every client grows the
 * same):
 *
 * - **Craters**: old impact bowls in the surface, a rim of thrown-up rust
 *   soil around each, the floor lined with pale drift sand, dark scorched
 *   regolith or rust dust.
 * - **Gem caverns**: deep geodes hollowed out of the rock, their walls
 *   bristling with big rare earth crystals (ten times gold's worth a cell):
 *   dig down to one and it's a fortune.
 * - **Geysers**: vents like the ocean floor's black smokers, a squat mound
 *   with a sulphur-crusted mouth, on the surface and on cave floors. They
 *   smoke harmlessly, until they blow (World.stepGeysers).
 * - **Flora** (positions only; the client draws them, flora.ts): alien
 *   plants on the open ground and in the caves.
 */

const at = (x: number, y: number) => y * WORLD_W + x;
const inside = (x: number, y: number) => x >= 4 && x < WORLD_W - 4 && y >= 0 && y < WORLD_H - 12;
const natural = (v: number) => v === Mat.Rock || isSoil(v);

/** The top of the ground in column x (first non-air cell). */
function topOf(m: Uint8Array, x: number): number {
  let y = 0;
  while (y < WORLD_H - 12 && m[at(x, y)] === Mat.Air) y++;
  return y;
}

/** Is x clear of every span (bunkers, towers, the siege works) by `pad`? */
const clearOf = (x0: number, x1: number, spans: readonly { x0: number; x1: number }[], pad: number) => spans.every((c) => x1 + pad < c.x0 || x0 - pad > c.x1);

// ------------------------------------------------------------------ craters

export interface Crater {
  x: number;
  y: number;
  r: number;
  /** What its bowl is lined with (sand, rust dust or soil). */
  lining: number;
}

/**
 * Old impact craters: a bowl pressed into the surface, its floor lined with
 * sand or rust dust, a raised rim of rust soil around it fading out into the
 * ground. Never on a bunker, a tower or the siege works.
 */
export function placeCraters(m: Uint8Array, seed: number, spans: readonly { x0: number; x1: number }[], dead = false): Crater[] {
  const rng = new Rng(seed ^ 0xc4a7e5);
  const out: Crater[] = [];
  const want = 7 + rng.int(6);
  for (let tries = 0; tries < want * 40 && out.length < want; tries++) {
    const r = 18 + rng.int(rng.next() < 0.3 ? 40 : 20);
    const cx = 60 + r * 2 + rng.int(WORLD_W - 120 - r * 4);
    const x0 = Math.floor(cx - r * 1.5);
    const x1 = Math.ceil(cx + r * 1.5);
    if (!clearOf(x0, x1, spans, 20) || out.some((c) => Math.abs(c.x - cx) < c.r + r + 30)) continue;
    // Gentle ground only (not a cliff edge), and natural soil under it.
    const tops: number[] = [];
    for (let x = x0; x <= x1; x++) tops.push(topOf(m, x));
    const base = tops[Math.floor(tops.length / 2)];
    if (Math.max(...tops) - Math.min(...tops) > Math.max(8, r * 0.5)) continue; // (flat ground: on a slope it's just a pit)
    if (!(natural(m[at(cx, base)]) || (dead && isDeadGround(m[at(cx, base)])))) continue;
    const depth = Math.max(6, Math.floor(r * (0.45 + rng.next() * 0.2)));
    const rim = Math.max(3, Math.floor(r * 0.22));
    // (Pale drift sand, dark scorched regolith, or rust dust: never just soil, so the bowl reads against the ground.)
    const pick = rng.next();
    // (In the deadland: glazed with trinitite, the glass the old fires left.)
    const lining = dead ? (pick < 0.85 ? Mat.Glass : Mat.Ash) : pick < 0.45 ? Mat.Sand : pick < 0.7 ? Mat.Regolith : Mat.RustSand;
    for (let x = x0; x <= x1; x++) {
      const top = tops[x - x0];
      const u = (x - cx) / r;
      const au = Math.abs(u);
      if (au < 1) {
        // The bowl: down to a curved floor, lined.
        const floor = base + Math.round(depth * (1 - u * u)) - Math.round((1 - au) * 0);
        for (let y = Math.min(top, base - rim - 2); y < floor; y++) if (inside(x, y) && m[at(x, y)] !== Mat.Bedrock) m[at(x, y)] = Mat.Air;
        const line = 3 + (hashCell(x, seed) % 2);
        for (let k = 0; k < line; k++) if (inside(x, floor + k) && (natural(m[at(x, floor + k)]) || isDeadGround(m[at(x, floor + k)]))) m[at(x, floor + k)] = lining;
      } else {
        // The rim: thrown-up rust soil, highest at the lip, fading out over half a radius.
        const fall = 1 - (au - 1) / 0.5;
        if (fall <= 0) continue;
        const h = Math.round(rim * fall * fall);
        const rimMat = dead ? ((hashCell(x, seed) & 1) === 0 ? Mat.Gravel : Mat.Ash) : Mat.Dirt;
        for (let k = 1; k <= h; k++) if (inside(x, top - k) && m[at(x, top - k)] === Mat.Air) m[at(x, top - k)] = (hashCell(x + k * 31, seed) & 7) === 0 ? lining : rimMat;
      }
    }
    out.push({ x: cx, y: base, r, lining });
  }
  return out;
}

/**
 * Line the craters' bowls again once the grass and snow are on: their floors
 * stay drift sand or rust dust, not turf (the rims take the frosting).
 */
export function relineCraters(m: Uint8Array, craters: readonly Crater[]): void {
  for (const c of craters) {
    for (let x = Math.ceil(c.x - c.r * 0.92); x <= c.x + c.r * 0.92; x++) {
      const y = topOf(m, x);
      for (let k = 0; k < 4; k++) {
        const v = m[at(x, y + k)];
        if (inside(x, y + k) && (v === Mat.Grass || v === Mat.Snow || natural(v) || isDeadGround(v))) m[at(x, y + k)] = c.lining;
      }
    }
  }
}

const hashCell = (x: number, seed: number) => {
  let h = (x * 0x27d4eb2d) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
};

// -------------------------------------------------------------- gem caverns

export interface GemCavern {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Gem caverns: a few deep geodes, hollows in natural ground well under the
 * surface, their walls, floor and roof bristling with big rare earth
 * crystals pointing inward. A crystal is a tapering prism up to 15 cells
 * long; a cavern holds a dozen or so.
 */
export function placeGemCaverns(m: Uint8Array, seed: number, spans: readonly { x0: number; x1: number }[]): GemCavern[] {
  const rng = new Rng(seed ^ 0x6e3c4b);
  const out: GemCavern[] = [];
  const want = 2 + rng.int(3);
  for (let tries = 0; tries < 60 && out.length < want; tries++) {
    const rx = 26 + rng.int(22);
    const ry = 14 + rng.int(9);
    const cx = 80 + rng.int(WORLD_W - 160);
    const top = topOf(m, cx);
    const cy = top + 150 + rng.int(Math.max(1, WORLD_H - top - 150 - 60 - ry));
    if (cy + ry + 14 >= WORLD_H - 12) continue;
    if (!clearOf(cx - rx, cx + rx, spans, 30) || out.some((c) => Math.abs(c.x - cx) < c.rx + rx + 40)) continue;
    // Solid natural ground all round it (no bunker basement, no labyrinth).
    let ok = true;
    for (let y = cy - ry - 8; y <= cy + ry + 8 && ok; y += 4) for (let x = cx - rx - 8; x <= cx + rx + 8 && ok; x += 4) if (!inside(x, y) || !(natural(m[at(x, y)]) || m[at(x, y)] === Mat.Air || m[at(x, y)] === Mat.Gold)) ok = false;
    if (!ok) continue;
    // The hollow (lumpy, a little flattened at the bottom), with a rock shell.
    for (let y = cy - ry - 4; y <= cy + ry + 4; y++) {
      for (let x = cx - rx - 4; x <= cx + rx + 4; x++) {
        const wob = 1 + 0.12 * Math.sin(x * 0.31 + seed) * Math.cos(y * 0.27);
        const u = (x - cx) / (rx * wob);
        const v = (y - cy) / (ry * (y > cy ? 0.8 : 1) * wob);
        const d = u * u + v * v;
        if (d <= 1) m[at(x, y)] = Mat.Air;
        else if (d <= 1.35 && m[at(x, y)] !== Mat.Air) m[at(x, y)] = Mat.Rock;
      }
    }
    // Crystals: from points round the shell, pointing at the middle.
    const n = 10 + rng.int(7);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      let px = Math.round(cx + Math.cos(a) * rx);
      let py = Math.round(cy + Math.sin(a) * ry * (Math.sin(a) > 0 ? 0.8 : 1));
      // Back out to the wall.
      for (let s = 0; s < 6 && m[at(px, py)] === Mat.Air; s++) {
        px += Math.round(Math.cos(a));
        py += Math.round(Math.sin(a));
      }
      const dir = Math.atan2(cy - py, cx - px) + rng.range(-0.35, 0.35);
      prism(m, px, py, dir, 7 + rng.int(9), 2 + rng.int(2));
    }
    out.push({ x: cx, y: cy, rx, ry });
  }
  return out;
}

/** A big crystal: a prism from (x, y) along `dir`, `w` cells thick at the root, tapering to a point. */
export function prism(m: Uint8Array, x: number, y: number, dir: number, len: number, w: number): number {
  let n = 0;
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  for (let r = -1; r <= len; r++) {
    const half = Math.max(0, w * (1 - Math.max(0, r - len * 0.55) / (len * 0.45)));
    for (let q = -Math.ceil(half); q <= Math.ceil(half); q++) {
      if (Math.abs(q) > half + 0.25) continue;
      const px = Math.round(x + c * r - s * q);
      const py = Math.round(y + s * r + c * q);
      if (!inside(px, py) || m[at(px, py)] === Mat.Bedrock) continue;
      if (m[at(px, py)] !== Mat.RareEarth) n++;
      m[at(px, py)] = Mat.RareEarth;
    }
  }
  return n;
}

// ------------------------------------------------------------------ geysers

export interface GeyserSite {
  /** The mouth (world cells): the vent's opening, smoke rises from here. */
  x: number;
  y: number;
  /** On a cave floor rather than the open surface. */
  cave: boolean;
}

/**
 * Geysers: black-smoker vents, a squat mound of dark regolith with a rock
 * chimney and a sulphur-crusted mouth. Four to six on the surface, three to
 * five on big cave floors.
 */
export function placeGeysers(m: Uint8Array, seed: number, spans: readonly { x0: number; x1: number }[], craters: readonly Crater[]): GeyserSite[] {
  const rng = new Rng(seed ^ 0x9e75e2);
  const out: GeyserSite[] = [];
  const far = (x: number, y: number) => out.every((g) => Math.abs(g.x - x) > 160 || Math.abs(g.y - y) > 60);
  const surface = 4 + rng.int(3);
  for (let tries = 0; tries < 80 && out.length < surface; tries++) {
    const x = 70 + rng.int(WORLD_W - 140);
    if (!clearOf(x - 12, x + 12, spans, 30) || craters.some((c) => Math.abs(c.x - x) < c.r + 14)) continue;
    const y = topOf(m, x);
    if (Math.abs(topOf(m, x - 8) - y) > 5 || Math.abs(topOf(m, x + 8) - y) > 5 || !natural(m[at(x, y)]) || !far(x, y)) continue;
    out.push({ x, y: mound(m, x, y), cave: false });
  }
  const caves = 3 + rng.int(3);
  for (let tries = 0; tries < 900 && out.length < surface + caves; tries++) {
    const x = 40 + rng.int(WORLD_W - 80);
    if (!clearOf(x - 12, x + 12, spans, 30)) continue;
    let y = topOf(m, x) + 50 + rng.int(Math.max(1, WORLD_H - topOf(m, x) - 120));
    if (!inside(x, y) || m[at(x, y)] !== Mat.Air) continue;
    while (y < WORLD_H - 20 && m[at(x, y)] === Mat.Air) y++;
    if (!natural(m[at(x, y)])) continue;
    // A real cave: headroom over it, and floor either side.
    let room = 0;
    while (room < 40 && m[at(x, y - 1 - room)] === Mat.Air) room++;
    if (room < 32 || m[at(x - 8, y)] === Mat.Air || m[at(x + 8, y)] === Mat.Air || !far(x, y)) continue;
    out.push({ x, y: mound(m, x, y), cave: true });
  }
  return out;
}

/** Build a vent mound on the ground at (x, ground y); returns the mouth's y. */
function mound(m: Uint8Array, x: number, gy: number): number {
  const R = 9;
  const H = 6;
  for (let dx = -R; dx <= R; dx++) {
    const h = Math.round(H * (1 - (dx / R) ** 2));
    for (let k = 0; k <= h + 3; k++) {
      const y = gy - h + k;
      if (!inside(x + dx, y)) continue;
      const chimney = Math.abs(dx) <= 1;
      m[at(x + dx, y)] = chimney ? Mat.Rock : Math.abs(dx) <= 3 && k <= 1 ? Mat.Ochre : Mat.Regolith;
    }
  }
  // The mouth: a little pit in the chimney's top, crusted with sulphur round it.
  const top = gy - H;
  for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, top)) m[at(x + dx, top)] = Mat.Air;
  return top;
}

// -------------------------------------------------------------------- flora

export const FloraKind = {
  /** A centipede plant: a segmented, curling stalk with leg-like barbs, on open ground. */
  Centipede: 0,
  /** Coral fungus: a branching fan, bioluminescent tips, on rock and cave floors. */
  Coral: 1,
  /** Tube worms: a cluster of white tubes with red plumes, round the geysers. */
  Tubes: 2,
  /** Hanging coral: strands from a cave roof, glowing at the ends. */
  Hanging: 3,
  /** Puffball fungi: a clump of swollen caps, on soil and in caves. */
  Puffs: 4,
} as const;

export interface Flora {
  kind: number;
  /** Its root (world cells): the ground cell it grows from (for Hanging, the roof cell). */
  x: number;
  y: number;
  seed: number;
}

/**
 * Where the flora grows: on the open ground (centipede plants and
 * puffballs; dense on the meadows, sparse in the dunes, none on snow), on
 * cave floors (coral fans, puffballs), from cave roofs (hanging coral),
 * and in thickets round every geyser (tube worms).
 */
export function placeFlora(m: Uint8Array, seed: number, biome: number, geysers: readonly GeyserSite[], spans: readonly { x0: number; x1: number }[]): Flora[] {
  const rng = new Rng(seed ^ 0xf107a);
  const out: Flora[] = [];
  // Open ground: one chance every few cells, by biome (dunes, canyons, highlands, meadows).
  const every = [30, 18, 14, 8, 1e9][biome] ?? 16; // (nothing grows on the deadland's crust)
  for (let x = 8; x < WORLD_W - 8; x += 2) {
    if (rng.int(every) !== 0) continue;
    if (!clearOf(x - 6, x + 6, spans, 6)) continue;
    const y = topOf(m, x);
    const g = m[at(x, y)];
    if (g === Mat.Snow || !(natural(g) || g === Mat.Grass)) continue;
    if (Math.abs(topOf(m, x - 3) - topOf(m, x + 3)) > 4) continue;
    out.push({ kind: g === Mat.Rock ? FloraKind.Coral : rng.next() < 0.68 ? FloraKind.Centipede : FloraKind.Puffs, x, y, seed: rng.nextU32() });
  }
  // Caves: floors and roofs.
  for (let n = 0; n < 1800; n++) {
    const x = 10 + rng.int(WORLD_W - 20);
    const top = topOf(m, x);
    let y = top + 30 + rng.int(Math.max(1, WORLD_H - top - 60));
    if (!inside(x, y) || m[at(x, y)] !== Mat.Air) continue;
    const roof = rng.next() < 0.35;
    if (roof) {
      while (y > top && m[at(x, y)] === Mat.Air) y--;
      if (!natural(m[at(x, y)]) || m[at(x, y + 12)] !== Mat.Air) continue;
      out.push({ kind: FloraKind.Hanging, x, y, seed: rng.nextU32() });
    } else {
      while (y < WORLD_H - 14 && m[at(x, y)] === Mat.Air) y++;
      if (!(natural(m[at(x, y)]) || m[at(x, y)] === Mat.RareEarth) || m[at(x, y - 10)] !== Mat.Air) continue;
      out.push({ kind: rng.next() < 0.6 ? FloraKind.Coral : FloraKind.Puffs, x, y, seed: rng.nextU32() });
    }
  }
  // Tube-worm thickets round every vent.
  for (const g of geysers) {
    const n = 3 + rng.int(4);
    for (let k = 0; k < n; k++) {
      const x = g.x + (rng.next() < 0.5 ? -1 : 1) * (11 + rng.int(14));
      if (x < 6 || x >= WORLD_W - 6) continue;
      // The ground there, near the mound's foot.
      let y = g.y;
      while (y < WORLD_H - 14 && m[at(x, y)] === Mat.Air) y++;
      while (y > 0 && m[at(x, y - 1)] !== Mat.Air) y--;
      if (Math.abs(y - g.y) > 20) continue;
      out.push({ kind: FloraKind.Tubes, x, y, seed: rng.nextU32() });
    }
  }
  return out;
}

// ------------------------------------------------- geysers: the hazard itself

/** Hit points a geyser's vent takes before it blows (a few rifle rounds, one grenade). */
export const GEYSER_HP = 50;
/** Ticks of rumbling between its going critical and blowing (shot: a moment; on its own: a warning). */
export const GEYSER_FUSE = 45;
export const GEYSER_FUSE_SHOT = 8;
/** Ticks before it can blow again. */
export const GEYSER_COOLDOWN = 30 * 40;
/** Chance a quiet geyser starts rumbling on its own, each tick (about once in three minutes). */
export const GEYSER_CHANCE = 1 / (30 * 180);
/** The blast: radius and its harm at the mouth. */
export const GEYSER_BLAST_R = 26;
export const GEYSER_BLAST = 70;
/** The deadly smoke after it: how long it hangs, how far it reaches, and its harm a tick. */
export const GEYSER_TOXIC_TICKS = 30 * 4;
export const GEYSER_CLOUD_R = 34;
export const GEYSER_TOXIC = 1.15;

/** Where the deadly cloud hangs, `age` ticks after the blast: a column climbing off the mouth. */
export function geyserCloud(x: number, y: number, age: number): { x: number; y: number } {
  return { x, y: y - 22 - Math.min(40, age * 0.3) };
}

/**
 * A geyser blowing: a fountain of rock chunks (they hurt, and settle as
 * rubble), hot shrapnel, embers and billowing smoke out of the mouth, mostly
 * upward. The server spawns it; clients mirror it from the blow record's seed.
 */
export function geyserBurst(p: Particles, x: number, y: number, owner: number, rng: Rng): void {
  for (let k = 0; k < 26; k++) {
    const dx = rng.range(-0.75, 0.75);
    const s = rng.range(160, 380);
    p.spawn(PK.Stone, x + dx * 3, y - 2, dx * s, -s * rng.range(0.7, 1), rng.range(300, 420), Mat.Rubble, 0, owner);
  }
  for (let k = 0; k < 34; k++) {
    let dx = rng.range(-1, 1);
    let dy = rng.range(-1, 0.25);
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    dx /= d;
    dy /= d;
    const s = rng.range(240, 520);
    p.spawn(PK.Shrapnel, x, y - 2, dx * s, dy * s, rng.range(12, 22), 0, 0, owner);
  }
  for (let k = 0; k < 16; k++) p.spawn(PK.Flame, x + rng.range(-3, 3), y - 2, rng.range(-60, 60), rng.range(-220, -80), rng.range(10, 20), 0, 0, owner);
  for (let k = 0; k < 40; k++) p.spawn(PK.Smoke, x + rng.range(-4, 4), y - 4, rng.range(-40, 40), rng.range(-160, -40), rng.range(90, 160), 0, 0, owner);
}
