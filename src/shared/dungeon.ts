import { WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import { Rng, hash2 } from './rng.ts';
import { TANK_H, TANK_W } from './tank.ts';
import { WeaponId } from './weapons.ts';

/**
 * Extraction's map: one massive labyrinth under a high desert, built from
 * the seed (server and clients alike). An ancient step pyramid stands over
 * its middle; under the sand the whole underground is a grid of rooms in
 * stone that never yields (alien temple halls up top, cobblestone ruins
 * deeper down), linked by doorways and shafts, with a glyph-lined sanctum
 * at the very bottom where the golden idol sits on its altar. Each of the
 * four teams has a well shaft down from its own stretch of the surface.
 * The rooms hide booby traps, loot, and vacant tanks.
 *
 * Grid: cell (c, r) spans CW x CH cells from (X0 + c*CW, Y0 + r*CH); its
 * room is the interior [ROOM_L, ROOM_R) x [ROOM_T, ROOM_B). Neighbours side
 * by side join through a full-height doorway, one above the other through a
 * shaft SHAFT_W wide in the slab between them.
 */
export const X0 = 16;
export const Y0 = 196;
export const CW = 64;
export const CH = 48;
export const COLS = 63;
export const ROWS = 16;
export const ROOM_L = 6;
export const ROOM_R = 58;
export const ROOM_T = 12;
export const ROOM_B = 42;
export const SHAFT_HALF = 9;
/** Rows of temple stone at the top; cobblestone ruins below. */
export const TEMPLE_ROWS = 5;
/** Depth of a spike pit (cells). */
export const SPIKE_DEPTH = 5;
/** Open edges per cell (`Dungeon.open`). */
export const OPEN_E = 1;
export const OPEN_S = 2;
/** Surface height the Extraction desert sits around (much higher than usual: the map is deep). */
export const DUNGEON_SURFACE = Math.round(WORLD_H * 0.14);
/** The extraction rocket's size (cells). */
export const EVAC_W = 18;
export const EVAC_H = 40;
/** Vacant tanks waiting in the labyrinth (the tank slots left over are for radio calls). */
export const DUNGEON_TANKS = 3;
/** Back-wall kinds (structures.ts Backdrop continues here). */
export const BACK_TEMPLE = 3;
export const BACK_RUINS = 4;

export const TrapKind = {
  /** A pit of spikes in a room's floor: wounds the legs of whoever stands in it. */
  Spikes: 0,
  /** A dart thrower in a room's wall: fires across the room at whoever is in it (go prone to duck under). */
  Darts: 1,
  /** A pressure plate in the floor: blows up under whoever steps on it, once. */
  Mine: 2,
} as const;

export interface Trap {
  id: number;
  kind: number;
  /** Spikes: pit's top-left. Darts: the muzzle (inside the room). Mine: the plate's centre, on the floor. */
  x: number;
  y: number;
  /** Spikes: pit width. Darts: how far the room reaches in front of it. Mine: plate width. */
  w: number;
  /** Darts: which way it fires (+1 east, -1 west). */
  dir: number;
  /** The room it guards. */
  c: number;
  r: number;
}

/** A large open space spanning a block of cells: a pillared temple hall, or a natural cavern. */
export const RegionKind = { Hall: 0, Cavern: 1 } as const;
export interface Region {
  kind: number;
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export interface Dungeon {
  /** Per cell (r * COLS + c): OPEN_E / OPEN_S bits. */
  open: Uint8Array;
  sanctum: { c0: number; c1: number; r0: number; r1: number };
  /** Large open spaces breaking up the grid. */
  regions: Region[];
  pyramid: { x: number; base: number; apex: number; halfWidth: number };
  /** Well shafts down from the surface: one per team (by team index), then the pyramid's. */
  entrances: { x: number; top: number; c: number; r: number }[];
  /** Where the golden idol rests (item centre). */
  idol: { x: number; y: number };
  traps: Trap[];
  tanks: { x: number; y: number }[];
  loot: { x: number; y: number; weapon: number }[];
}

export const cellX = (c: number) => X0 + c * CW;
export const cellY = (r: number) => Y0 + r * CH;
/** The cell containing world (x, y), or -1 outside the grid. */
export function cellAt(x: number, y: number): number {
  const c = Math.floor((x - X0) / CW);
  const r = Math.floor((y - Y0) / CH);
  return c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : r * COLS + c;
}
/** Floor (top of the slab under a room) of row r. */
export const floorY = (r: number) => cellY(r) + ROOM_B;

/**
 * Each team's well (by team, west to east): the column it comes down and the
 * row it opens into. The inner teams' wells are nearer the sanctum; the
 * outer teams' run deeper, so every team has about as far to go.
 */
export const ENTRANCE_COLS = [11, 18, 43, 50];
export const ENTRANCE_ROWS = [6, 0, 0, 6];
const PYRAMID_COL = Math.floor(COLS / 2);

const LOOT = [WeaponId.Bazooka, WeaponId.Sniper, WeaponId.Grenade, WeaponId.Rifle, WeaponId.RepairKit, WeaponId.Grenade];

export function generateDungeon(m: Uint8Array, heights: Int32Array, seed: number, backdrop?: Uint8Array): Dungeon {
  const rng = new Rng((seed ^ 0xd06e0) >>> 0);
  const set = (x: number, y: number, v: number, back = 0) => {
    if (x < 4 || x >= WORLD_W - 4 || y < 0 || y >= WORLD_H - 12) return;
    m[y * WORLD_W + x] = v;
    if (backdrop && v === Mat.Air && back) backdrop[y * WORLD_W + x] = back;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number, back = 0) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, v, back);
  };
  const stoneAt = (y: number) => (y < Y0 + TEMPLE_ROWS * CH ? Mat.Glyph : Mat.Cobble);
  const backAt = (y: number) => (y < Y0 + TEMPLE_ROWS * CH ? BACK_TEMPLE : BACK_RUINS);

  // The whole underground below the sand is ancient stone.
  for (let y = Y0; y < WORLD_H - 12; y++) {
    const v = stoneAt(y);
    for (let x = 4; x < WORLD_W - 4; x++) m[y * WORLD_W + x] = v;
  }

  // A perfect maze (randomised depth-first search), then extra openings so
  // it plays as a dungeon with many routes rather than one long thread.
  const open = new Uint8Array(COLS * ROWS);
  const sanctum = { c0: PYRAMID_COL - 2, c1: PYRAMID_COL + 1, r0: ROWS - 2, r1: ROWS - 1 };
  const inSanctum = (c: number, r: number) => c >= sanctum.c0 && c <= sanctum.c1 && r >= sanctum.r0 && r <= sanctum.r1;
  const seen = new Uint8Array(COLS * ROWS);
  const stack = [rng.int(COLS * ROWS)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack[stack.length - 1];
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    // Sideways three times as likely as up or down: long galleries, few shafts.
    const next: number[] = [];
    if (c > 0 && !seen[i - 1]) next.push(i - 1, i - 1, i - 1);
    if (c < COLS - 1 && !seen[i + 1]) next.push(i + 1, i + 1, i + 1);
    if (r > 0 && !seen[i - COLS]) next.push(i - COLS);
    if (r < ROWS - 1 && !seen[i + COLS]) next.push(i + COLS);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const j = next[rng.int(next.length)];
    if (j === i + 1) open[i] |= OPEN_E;
    else if (j === i - 1) open[j] |= OPEN_E;
    else if (j === i + COLS) open[i] |= OPEN_S;
    else open[j] |= OPEN_S;
    seen[j] = 1;
    stack.push(j);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (c < COLS - 1 && rng.next() < 0.2) open[i] |= OPEN_E;
      if (r < ROWS - 1 && rng.next() < 0.06) open[i] |= OPEN_S;
      if (inSanctum(c, r)) {
        if (c < sanctum.c1) open[i] |= OPEN_E;
        if (r < sanctum.r1) open[i] |= OPEN_S;
      }
    }
  }

  // The wells come straight down their column to the row they open into.
  for (let k = 0; k < ENTRANCE_COLS.length; k++) for (let r = 0; r < ENTRANCE_ROWS[k]; r++) open[r * COLS + ENTRANCE_COLS[k]] |= OPEN_S;

  // Large open spaces: blocks of cells opened into one, so the labyrinth
  // isn't all corridors: tall temple halls with ledges, and caverns.
  const regionOf = new Int16Array(COLS * ROWS).fill(-1);
  const regions: Region[] = [];
  for (let tries = 0; tries < 120 && regions.length < 9; tries++) {
    const w = 4 + rng.int(5);
    const hgt = 2 + rng.int(3);
    const c0 = rng.int(COLS - w);
    const r0 = 1 + rng.int(ROWS - 3 - hgt);
    const c1 = c0 + w - 1;
    const r1 = r0 + hgt - 1;
    let ok = true;
    for (let r = r0 - 1; r <= r1 + 1 && ok; r++) {
      for (let c = c0 - 1; c <= c1 + 1 && ok; c++) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (regionOf[r * COLS + c] >= 0 || inSanctum(c, r)) ok = false;
      }
    }
    if (!ok) continue;
    const kind = rng.next() < 0.5 ? RegionKind.Hall : RegionKind.Cavern;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        regionOf[i] = regions.length;
        if (c < c1) open[i] |= OPEN_E;
        if (r < r1) open[i] |= OPEN_S;
      }
    }
    regions.push({ kind, c0, c1, r0, r1 });
  }

  // Carve the rooms, doorways and shafts.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = cellX(c);
      const y = cellY(r);
      const back = backAt(y + ROOM_T);
      fill(x + ROOM_L, y + ROOM_T, x + ROOM_R, y + ROOM_B, Mat.Air, back);
      const o = open[r * COLS + c];
      if (o & OPEN_E) fill(x + ROOM_R, y + ROOM_T, x + CW + ROOM_L, y + ROOM_B, Mat.Air, back);
      if (o & OPEN_S) fill(x + CW / 2 - SHAFT_HALF, y + ROOM_B, x + CW / 2 + SHAFT_HALF, y + CH + ROOM_T, Mat.Air, back);
    }
  }

  for (const g of regions) {
    const x0 = cellX(g.c0) + ROOM_L;
    const x1 = cellX(g.c1) + ROOM_R;
    const y0 = cellY(g.r0) + ROOM_T;
    const y1 = cellY(g.r1) + ROOM_B;
    const back = backAt(y0);
    if (g.kind === RegionKind.Hall) {
      // One tall hall; ledges where the floors were (clear over each cell's
      // middle, so you can still jet from level to level), statues for cover.
      fill(x0, y0, x1, y1, Mat.Air, back);
      const stone = stoneAt(y0);
      for (let r = g.r0; r < g.r1; r++) {
        const ly = floorY(r);
        for (let c = g.c0; c <= g.c1; c++) {
          const x = cellX(c);
          if (rng.next() < 0.75) fill(x + 2, ly, x + CW / 2 - SHAFT_HALF - 3, ly + 4, stone);
          if (rng.next() < 0.75) fill(x + CW / 2 + SHAFT_HALF + 3, ly, x + CW - 2, ly + 4, stone);
        }
      }
      for (let c = g.c0; c <= g.c1; c++) {
        if (rng.next() < 0.45) {
          const sx = cellX(c) + (rng.next() < 0.5 ? 12 : CW - 22);
          fill(sx, y1 - 14, sx + 10, y1, Mat.Glyph); // plinth and body
          fill(sx + 2, y1 - 19, sx + 8, y1 - 14, Mat.Glyph); // head
        }
      }
    } else {
      // A cavern: an irregular void eaten out of the stone, loose rubble and
      // a boulder or two on its floor.
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = (x1 - x0) / 2 + 10;
      const ry = (y1 - y0) / 2 + 12;
      for (let y = y0 - 14; y < y1 + 8; y++) {
        for (let x = x0 - 12; x < x1 + 12; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          const n = (hash2(x >> 3, y >> 3, seed ^ 0xcafe) >>> 0) / 4294967296;
          if (d < 0.78 - n * 0.3) set(x, y, Mat.Air, back);
        }
      }
      // Find the cavern floor under each column and heap rubble and boulders on it.
      for (let k = 0; k < 6; k++) {
        const bx = Math.floor(x0 + rng.next() * (x1 - x0 - 12));
        let fy = Math.floor(cy);
        while (fy < WORLD_H - 13 && m[fy * WORLD_W + bx] === Mat.Air) fy++;
        if (k < 2) fill(bx, fy - 8, bx + 10, fy, Mat.Rock);
        else for (let j = 0; j < 12; j++) for (let y = fy - Math.max(0, 4 - Math.abs(j - 6) * 0.7); y < fy; y++) set(bx + j, Math.floor(y), Mat.Rubble);
      }
    }
  }

  // The sanctum: its cells opened into one tall glyph-lined hall, an altar in the middle.
  const sx0 = cellX(sanctum.c0) + ROOM_L;
  const sx1 = cellX(sanctum.c1) + ROOM_R;
  const sy0 = cellY(sanctum.r0) + ROOM_T;
  const sy1 = cellY(sanctum.r1) + ROOM_B;
  for (let y = sy0 - 8; y < sy1 + 8; y++) {
    for (let x = sx0 - 8; x < sx1 + 8; x++) {
      const i = y * WORLD_W + x;
      if (m[i] !== Mat.Air) m[i] = Mat.Glyph;
    }
  }
  fill(sx0, sy0, sx1, sy1, Mat.Air, BACK_TEMPLE);
  const ax = Math.round((sx0 + sx1) / 2);
  fill(ax - 18, sy1 - 4, ax + 18, sy1, Mat.Glyph);
  fill(ax - 11, sy1 - 9, ax + 11, sy1 - 4, Mat.Glyph);
  const idol = { x: ax, y: sy1 - 9 - 3 };

  // The step pyramid over the middle, its apex shrine, a shaft down its
  // heart to the labyrinth, and a gallery through its base at ground level.
  const px = cellX(PYRAMID_COL) + CW / 2;
  const STEPS = 8;
  const STEP_H = 14;
  const base = Math.max(heights[px], STEPS * STEP_H + 34); // room for the shrine on top
  const hw0 = 300;
  for (let s = 0; s < STEPS; s++) {
    const hw = hw0 - s * 34;
    fill(px - hw, base - (s + 1) * STEP_H, px + hw, base - s * STEP_H, Mat.Glyph);
  }
  fill(px - hw0, base, px + hw0, base + 24, Mat.Glyph); // footings
  const apex = base - STEPS * STEP_H;
  fill(px - 28, apex - 30, px + 28, apex, Mat.Glyph);
  fill(px - 22, apex - 24, px + 22, apex, Mat.Air, BACK_TEMPLE);
  fill(px - 28, apex - 16, px - 22, apex, Mat.Air, BACK_TEMPLE);
  fill(px + 22, apex - 16, px + 28, apex, Mat.Air, BACK_TEMPLE);
  fill(px - SHAFT_HALF - 3, base, px + SHAFT_HALF + 3, Y0 + ROOM_T, Mat.Glyph);
  fill(px - SHAFT_HALF, apex, px + SHAFT_HALF, Y0 + ROOM_T, Mat.Air, BACK_TEMPLE);
  fill(px - hw0, base - 22, px + hw0, base, Mat.Air, BACK_TEMPLE);
  const pyramid = { x: px, base, apex, halfWidth: hw0 };

  // The teams' well shafts, lined in cobble, flanked by two obelisks.
  const entrances: Dungeon['entrances'] = [];
  for (let k = 0; k < ENTRANCE_COLS.length; k++) {
    const c = ENTRANCE_COLS[k];
    const x = cellX(c) + CW / 2;
    const top = heights[x];
    fill(x - SHAFT_HALF - 4, top - 4, x + SHAFT_HALF + 4, Y0 + ROOM_T, Mat.Cobble);
    fill(x - SHAFT_HALF, top - 4, x + SHAFT_HALF, Y0 + ROOM_T, Mat.Air, BACK_RUINS);
    for (const side of [-1, 1]) {
      const ox = side < 0 ? x - SHAFT_HALF - 8 : x + SHAFT_HALF + 4;
      fill(ox, top - 22, ox + 4, top - 4, Mat.Glyph);
      fill(ox + 1, top - 25, ox + 3, top - 22, Mat.Glyph);
    }
    entrances.push({ x, top: top - 4, c, r: ENTRANCE_ROWS[k] });
  }
  entrances.push({ x: px, top: apex, c: PYRAMID_COL, r: 0 });

  // Fill the rooms: vacant tanks (one in each quarter), then traps and loot.
  // The rooms a well comes down through stay clear of traps.
  const arrival = new Set<number>();
  for (const e of entrances) for (let r = 0; r <= e.r; r++) arrival.add(r * COLS + e.c);
  const busy = new Uint8Array(COLS * ROWS);
  const tanks: Dungeon['tanks'] = [];
  // Halls first (room to manoeuvre), then the quarters without one.
  for (const g of regions) {
    if (g.kind !== RegionKind.Hall || tanks.length >= DUNGEON_TANKS) continue;
    const c = g.c0 + rng.int(g.c1 - g.c0 + 1);
    const i = g.r1 * COLS + c;
    if (open[i] & OPEN_S) continue;
    busy[i] = 1;
    tanks.push({ x: cellX(c) + CW / 2 - TANK_W / 2, y: floorY(g.r1) - TANK_H - 1 });
  }
  for (let q = 0; q < 4 && tanks.length < DUNGEON_TANKS; q++) {
    if (tanks.some((t) => Math.floor(((t.x - X0) / CW) / (COLS / 4)) === q)) continue;
    for (let tries = 0; tries < 20; tries++) {
      const c = Math.floor((q * COLS) / 4) + rng.int(Math.floor(COLS / 4));
      const r = 2 + rng.int(ROWS - 5);
      const i = r * COLS + c;
      if (busy[i] || inSanctum(c, r) || open[i] & OPEN_S || regionOf[i] >= 0) continue;
      busy[i] = 1;
      tanks.push({ x: cellX(c) + CW / 2 - TANK_W / 2, y: floorY(r) - TANK_H - 1 });
      break;
    }
  }
  const traps: Trap[] = [];
  const loot: Dungeon['loot'] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const u = rng.next();
      const v = rng.next();
      const k = rng.next();
      if (busy[i] || inSanctum(c, r) || arrival.has(i) || traps.length >= 240) continue;
      const x = cellX(c);
      const fy = floorY(r);
      const shaftDown = (open[i] & OPEN_S) !== 0;
      const westWall = c === 0 || !(open[i - 1] & OPEN_E);
      const eastWall = c === COLS - 1 || !(open[i] & OPEN_E);
      const inRegion = regionOf[i] >= 0;
      if (u < 0.06 && !shaftDown && !inRegion) {
        const x0 = x + CW / 2 - 8;
        fill(x0, fy, x0 + 16, fy + SPIKE_DEPTH, Mat.Air, backAt(fy));
        traps.push({ id: traps.length, kind: TrapKind.Spikes, x: x0, y: fy, w: 16, dir: 0, c, r });
      } else if (u < 0.12 && (westWall || eastWall) && !inRegion) {
        const west = westWall && (!eastWall || k < 0.5);
        traps.push({ id: traps.length, kind: TrapKind.Darts, x: west ? x + ROOM_L + 1 : x + ROOM_R - 1, y: fy - 9, w: ROOM_R - ROOM_L, dir: west ? 1 : -1, c, r });
      } else if (u < 0.18 && !inRegion) {
        let mx = x + ROOM_L + 8 + Math.floor(k * 36);
        if (shaftDown && Math.abs(mx - (x + CW / 2)) < SHAFT_HALF + 5) mx = x + ROOM_L + 6;
        traps.push({ id: traps.length, kind: TrapKind.Mine, x: mx, y: fy, w: 8, dir: 0, c, r });
      }
      if (v < 0.07) loot.push({ x: x + CW / 2 + (k < 0.5 ? -14 : 14), y: fy - 3, weapon: LOOT[Math.floor(k * LOOT.length) % LOOT.length] });
      else if (v < 0.13 && !inRegion) {
        const gx = k < 0.5 ? x + ROOM_L : x + ROOM_R - 6;
        fill(gx, fy - 3, gx + 6, fy, Mat.Gold);
      }
    }
  }
  return { open, sanctum, regions, pyramid, entrances, idol, traps, tanks, loot };
}
