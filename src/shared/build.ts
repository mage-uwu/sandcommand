import { ACTOR_H, ACTOR_W, WORLD_H, WORLD_W } from './constants.ts';
import { Mat } from './materials.ts';
import type { Terrain } from './terrain.ts';

/**
 * Fortifications built with the materializer, Cortex Command style: pick a
 * piece from the menu, it snaps to a grid, and gold turns into concrete and
 * armour plate. The server validates and applies; clients replay the same
 * op (`R_BUILD`, 7 bytes) against their copy of the terrain, so a bunker
 * costs less bandwidth than a rifle burst.
 *
 * Built cells are real terrain: hard (only explosion cores and diggers get
 * through), part of the distance field and the collapse rules, and they
 * crumble to rubble when blown apart.
 */
export const BUILD_GRID = 4;
/** How far from the builder's shoulder a piece's centre may be (cells). */
export const BUILD_REACH = 80;

export interface PieceDef {
  name: string;
  cost: number; // gold
  w: number; // cells
  h: number;
  /** Material per cell, row-major; Air = leave whatever is there. */
  cells: Uint8Array;
}

/**
 * Pieces are drawn as character grids at 2x2 cells per character, so they
 * line up with the 4-cell build grid in pairs: C concrete, M metal plate,
 * '.' open.
 */
function piece(name: string, cost: number, art: readonly string[]): PieceDef {
  const h = art.length * 2;
  const w = art[0].length * 2;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = art[y >> 1][x >> 1];
      cells[y * w + x] = ch === 'C' ? Mat.Concrete : ch === 'M' ? Mat.Metal : Mat.Air;
    }
  }
  return { name, cost, w, h, cells };
}

export const PIECES: readonly PieceDef[] = [
  piece('Block', 8, ['CCCC', 'CCCC', 'CCCC', 'CCCC']),
  piece('Wall', 10, ['CC', 'CC', 'CC', 'CC', 'CC', 'CC', 'CC', 'CC', 'CC', 'CC']),
  piece('Floor', 10, ['CCCCCCCCCC', 'CCCCCCCCCC']),
  piece('Ramp', 12, ['.......C', '......CC', '.....CCC', '....CCCC', '...CCCCC', '..CCCCCC', '.CCCCCCC', 'CCCCCCCC']),
  piece('Ramp', 12, ['C.......', 'CC......', 'CCC.....', 'CCCC....', 'CCCCC...', 'CCCCCC..', 'CCCCCCC.', 'CCCCCCCC']),
  piece('Plate', 20, ['MMMM', 'MMMM', 'MMMM', 'MMMM']),
  // A bunker: metal roof, a firing slit in the left wall, a doorway on the right
  // (interior 18 cells tall, so a 14-cell clone fits).
  piece('Bunker', 60, [
    'MMMMMMMMMMMMMM',
    'CC..........CC',
    'CC............',
    '..............',
    'CC............',
    'CC............',
    'CC............',
    'CC............',
    'CC............',
    'CC............',
  ]),
];

/**
 * Orientation: a piece can be turned (a quarter turn clockwise at a time)
 * and mirrored (left to right, before turning). A built piece is named by
 * one byte: its index in PIECES in the low five bits, then two bits of
 * quarter turns and one of mirror (`pieceCode`), so the requests and the
 * build record stay the size they were.
 */
export const ORIENTS = 8;
export const pieceCode = (index: number, orient: number) => (index & 31) | ((orient & 7) << 5);
/** Turn an orientation a quarter clockwise (keeping its mirror). */
export const rotateOrient = (o: number) => (o & 4) | ((o + 1) & 3);
/** Mirror an orientation (as seen: a turned piece flips across its own upright). */
export const mirrorOrient = (o: number) => (o ^ 4) & 4 | ((4 - (o & 3)) & 3);

const oriented = new Map<number, PieceDef>();

/** The piece a code names, turned and mirrored as it says (undefined for no piece). */
export function pieceOf(code: number): PieceDef | undefined {
  const base = PIECES[code & 31];
  if (!base) return undefined;
  const o = (code >> 5) & 7;
  if (o === 0) return base;
  let p = oriented.get(code);
  if (p) return p;
  let w = base.w;
  let h = base.h;
  let cells = new Uint8Array(base.cells);
  if (o & 4) {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = cells[y * w + (w - 1 - x)];
    cells = m;
  }
  for (let r = 0; r < (o & 3); r++) {
    // A quarter turn clockwise: the left column becomes the top row.
    const nw = h;
    const nh = w;
    const t = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) t[y * nw + x] = cells[(h - 1 - x) * w + y];
    cells = t;
    w = nw;
    h = nh;
  }
  p = { name: base.name, cost: base.cost, w, h, cells };
  oriented.set(code, p);
  return p;
}

export const BuildResult = {
  Ok: 0,
  Gold: 1, // can't afford it
  Far: 2, // out of reach
  World: 3, // off the edge of the world
  Room: 4, // mostly inside existing terrain
  Floating: 5, // touches nothing to stand on
  Blocked: 6, // someone is standing there
} as const;

export const BUILD_RESULT_TEXT = ['', 'need more GEMMs', 'out of reach', 'off the map', 'no room', 'nothing to anchor to', 'someone is in the way'];

/** A body that a piece may not be built over (top-left box). */
export interface BuildBlocker {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Snap a world point (where the cursor is) to the top-left cell of a piece centred there. */
export function snapPiece(p: PieceDef, wx: number, wy: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = Math.round((wx - p.w / 2) / BUILD_GRID) * BUILD_GRID;
  out.y = Math.round((wy - p.h / 2) / BUILD_GRID) * BUILD_GRID;
  return out;
}

/**
 * May the piece `code` names (pieceCode: which, and how it's turned) go at top-left (gx, gy) for a builder whose shoulder is at
 * (sx, sy) with `gold` to spend? Shared so the client's ghost preview shows
 * exactly what the server will accept. Pieces fill open cells and leave
 * existing terrain alone, so they can be set into a hillside; but at least
 * half must be open, and they must touch something to anchor to.
 */
export function canBuild(t: Terrain, code: number, gx: number, gy: number, sx: number, sy: number, gold: number, blockers: readonly BuildBlocker[]): number {
  const p = pieceOf(code);
  if (!p) return BuildResult.World;
  if (gx < 0 || gy < 0 || gx + p.w > WORLD_W || gy + p.h > WORLD_H || gx % BUILD_GRID || gy % BUILD_GRID) return BuildResult.World;
  if (gold < p.cost) return BuildResult.Gold;
  const dx = gx + p.w / 2 - sx;
  const dy = gy + p.h / 2 - sy;
  if (dx * dx + dy * dy > BUILD_REACH * BUILD_REACH) return BuildResult.Far;
  for (const b of blockers) {
    // Solid cells only: you can stand in a bunker's doorway while it goes up.
    const x0 = Math.max(gx, Math.floor(b.x));
    const y0 = Math.max(gy, Math.floor(b.y));
    const x1 = Math.min(gx + p.w - 1, Math.floor(b.x + b.w - 1e-6));
    const y1 = Math.min(gy + p.h - 1, Math.floor(b.y + b.h - 1e-6));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (p.cells[(y - gy) * p.w + (x - gx)] !== Mat.Air) return BuildResult.Blocked;
  }
  let solid = 0;
  let open = 0;
  let anchored = false;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.cells[y * p.w + x] === Mat.Air) continue;
      const wx = gx + x;
      const wy = gy + y;
      if (t.isSolid(wx, wy)) {
        solid++;
        anchored = true;
        continue;
      }
      open++;
      if (!anchored && (t.isSolid(wx - 1, wy) || t.isSolid(wx + 1, wy) || t.isSolid(wx, wy - 1) || t.isSolid(wx, wy + 1))) anchored = true;
    }
  }
  if (open < solid) return BuildResult.Room;
  if (!anchored) return BuildResult.Floating;
  return BuildResult.Ok;
}

/**
 * Materialize a piece: every open cell under one of its solid cells becomes
 * that material. Deterministic given the terrain, so clients replay it.
 * Appends x, y, mat triples of the cells it set to `placed`.
 */
export function applyBuild(t: Terrain, code: number, gx: number, gy: number, placed: number[]): number {
  placed.length = 0;
  const p = pieceOf(code);
  if (!p) return 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const m = p.cells[y * p.w + x];
      if (m === Mat.Air) continue;
      const wx = gx + x;
      const wy = gy + y;
      if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H || t.isSolid(wx, wy)) continue;
      t.set(wx, wy, m);
      placed.push(wx, wy, m);
    }
  }
  return placed.length / 3;
}

/** A clone's box as a build blocker. */
export function actorBlocker(x: number, y: number): BuildBlocker {
  return { x, y, w: ACTOR_W, h: ACTOR_H };
}
