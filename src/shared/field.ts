import { TILE_SHIFT, TILES_X, TILES_Y, WORLD_H, WORLD_W, WORDS_PER_ROW } from './constants.ts';
import type { Terrain } from './terrain.ts';

/**
 * Coarse distance field over the terrain, used as a broadphase so that moving
 * things cross empty space in one step instead of marching cell by cell.
 *
 * Resolution is 4x4 terrain cells per field cell (512x256). Each field cell
 * stores a 3-4 chamfer distance (orthogonal step 3, diagonal step 4) to the
 * nearest field cell containing any solid terrain, capped at FIELD_R cells.
 * Distances are integers, so every client computes the same field.
 *
 * Updates are incremental and proportional to the area whose coarse
 * occupancy actually changed (see update()), never to the world.
 */
export const FIELD_SHIFT = 2;
export const FIELD_CELL = 1 << FIELD_SHIFT;
export const FW = WORLD_W >> FIELD_SHIFT;
export const FH = WORLD_H >> FIELD_SHIFT;
export const FIELD_R = 8; // cap, in field cells (32 terrain cells)
const MAXD = FIELD_R * 3;

const TILE_IN_FIELD = 1 << (TILE_SHIFT - FIELD_SHIFT); // 4 field cells per tile side
const R_TILES = Math.ceil(FIELD_R / TILE_IN_FIELD); // 2

export class DistanceField {
  readonly d = new Uint8Array(FW * FH).fill(MAXD);
  /** Cached coarse occupancy: 1 if the 4x4 block holds any solid cell. */
  private readonly occ = new Uint8Array(FW * FH);
  private readonly mask = new Uint8Array(TILES_X * TILES_Y);
  private readonly masked: number[] = [];
  /** Field cells recomputed by the last update (for benchmarks). */
  lastUpdateCells = 0;

  constructor(readonly terrain: Terrain) {}

  /** Does field cell (fx, fy) contain any solid terrain? One nibble from each of 4 bitplane rows. */
  private coarseSolid(fx: number, fy: number): number {
    const s = this.terrain.solid;
    const shift = (fx & 7) << 2;
    let row = (fy << FIELD_SHIFT) * WORDS_PER_ROW + (fx >>> 3);
    let acc = 0;
    for (let k = 0; k < FIELD_CELL; k++, row += WORDS_PER_ROW) acc |= s[row] >>> shift;
    return (acc & 0xf) !== 0 ? 1 : 0;
  }

  /**
   * Bring the field up to date with every tile the terrain marked dirty.
   *
   * A distance can only change where coarse occupancy changed, and a chipped
   * block that still holds any solid cell has not changed. So each dirty tile
   * first re-derives its 16 occupancy bits; only tiles where one flipped
   * schedule a recompute, of themselves plus FIELD_R around them (the furthest
   * a change can propagate under the cap). Scheduled tiles form a mask that is
   * swept by the two chamfer passes in raster order; cells outside the mask
   * are read-only boundary values, so the result is exact.
   */
  update(): void {
    const dirty = this.terrain.fieldDirty;
    const mask = this.mask;
    const masked = this.masked;
    this.lastUpdateCells = 0;
    for (let t = 0; t < dirty.length; t++) {
      if (!dirty[t]) continue;
      dirty[t] = 0;
      const tx = t % TILES_X;
      const ty = (t / TILES_X) | 0;
      let flipped = false;
      for (let cy = ty * TILE_IN_FIELD; cy < (ty + 1) * TILE_IN_FIELD; cy++) {
        for (let cx = tx * TILE_IN_FIELD; cx < (tx + 1) * TILE_IN_FIELD; cx++) {
          const i = cy * FW + cx;
          const o = this.coarseSolid(cx, cy);
          if (o !== this.occ[i]) {
            this.occ[i] = o;
            flipped = true;
          }
        }
      }
      if (!flipped) continue;
      for (let y = Math.max(0, ty - R_TILES); y <= Math.min(TILES_Y - 1, ty + R_TILES); y++) {
        for (let x = Math.max(0, tx - R_TILES); x <= Math.min(TILES_X - 1, tx + R_TILES); x++) {
          const m = y * TILES_X + x;
          if (!mask[m]) {
            mask[m] = 1;
            masked.push(m);
          }
        }
      }
    }
    if (masked.length === 0) return;
    masked.sort((a, b) => a - b); // tile raster order
    const d = this.d;
    const occ = this.occ;
    for (const m of masked) {
      const x0 = (m % TILES_X) * TILE_IN_FIELD;
      const y0 = ((m / TILES_X) | 0) * TILE_IN_FIELD;
      for (let y = y0; y < y0 + TILE_IN_FIELD; y++)
        for (let x = x0; x < x0 + TILE_IN_FIELD; x++) d[y * FW + x] = occ[y * FW + x] ? 0 : MAXD;
    }
    // Forward pass: tile rows top-down, and within a tile row each cell row
    // left to right across the masked tiles, i.e. global raster order.
    let k = 0;
    while (k < masked.length) {
      const ty = (masked[k] / TILES_X) | 0;
      let e = k;
      while (e < masked.length && ((masked[e] / TILES_X) | 0) === ty) e++;
      for (let y = ty * TILE_IN_FIELD; y < (ty + 1) * TILE_IN_FIELD; y++) {
        for (let j = k; j < e; j++) {
          const x0 = (masked[j] % TILES_X) * TILE_IN_FIELD;
          for (let x = x0; x < x0 + TILE_IN_FIELD; x++) {
            const i = y * FW + x;
            let v = d[i];
            if (v === 0) continue;
            v = Math.min(v, this.at(x - 1, y) + 3, this.at(x - 1, y - 1) + 4, this.at(x, y - 1) + 3, this.at(x + 1, y - 1) + 4);
            d[i] = v > MAXD ? MAXD : v;
          }
        }
      }
      k = e;
    }
    // Backward pass: exact reverse order.
    k = masked.length - 1;
    while (k >= 0) {
      const ty = (masked[k] / TILES_X) | 0;
      let b = k;
      while (b >= 0 && ((masked[b] / TILES_X) | 0) === ty) b--;
      for (let y = (ty + 1) * TILE_IN_FIELD - 1; y >= ty * TILE_IN_FIELD; y--) {
        for (let j = k; j > b; j--) {
          const x0 = (masked[j] % TILES_X) * TILE_IN_FIELD;
          for (let x = x0 + TILE_IN_FIELD - 1; x >= x0; x--) {
            const i = y * FW + x;
            let v = d[i];
            if (v === 0) continue;
            v = Math.min(v, this.at(x + 1, y) + 3, this.at(x + 1, y + 1) + 4, this.at(x, y + 1) + 3, this.at(x - 1, y + 1) + 4);
            d[i] = v > MAXD ? MAXD : v;
          }
        }
      }
      k = b;
    }
    this.lastUpdateCells = masked.length * TILE_IN_FIELD * TILE_IN_FIELD;
    for (const m of masked) mask[m] = 0;
    masked.length = 0;
  }

  /** Read with world-edge semantics matching Terrain.isSolid: sides and floor solid, sky open. */
  private at(x: number, y: number): number {
    if (y < 0) return MAXD;
    if (x < 0 || x >= FW || y >= FH) return 0;
    return this.d[y * FW + x];
  }

  /**
   * Conservative clearance (in terrain cells) from world point (x, y) to the
   * nearest solid cell. Subtracts the half-diagonals of both field cells and
   * the 3-4 chamfer's worst-case overestimate, so moving this far in any
   * direction can never enter solid terrain.
   */
  clearance(x: number, y: number): number {
    const fx = Math.floor(x) >> FIELD_SHIFT;
    const fy = Math.floor(y) >> FIELD_SHIFT;
    if (y < 0 && x >= 0 && x < WORLD_W) return FIELD_R * FIELD_CELL - 8; // open sky
    const v = this.at(fx, fy);
    const c = ((v / 3) * 0.92 - 1.5) * FIELD_CELL;
    return c > 0 ? c : 0;
  }
}

export interface Hit {
  x: number; // final (free) position
  y: number;
  hit: boolean;
  nx: number; // surface normal, pointing out of the terrain
  ny: number;
  cx: number; // the solid cell that was hit
  cy: number;
  travelled: number; // distance moved before stopping
}

// Scratch objects start with non-integer values so V8 gives their fields an
// unboxed double representation from the outset (no per-write allocation).
export function newHit(): Hit {
  return { x: 0.5, y: 0.5, hit: false, nx: 0.5, ny: -0.5, cx: 0, cy: 0, travelled: 0.5 };
}

const normalScratch = { x: 0.5, y: 0.5 };

/**
 * Continuous swept collision against terrain. Sphere-traces through the
 * distance field (one lookup per clearance-sized jump) and only falls back to
 * exact per-cell bitplane tests within ~1 cell of a surface. Contact normals
 * come from the terrain's occupancy gradient, so responses are real
 * reflections and friction along the surface, not axis-aligned guesses.
 */
export class Collider {
  /** Field lookups / exact cell tests in the last sweep (for benchmarks). */
  probes = 0;

  constructor(
    readonly terrain: Terrain,
    readonly field: DistanceField,
  ) {}

  sweep(x: number, y: number, dx: number, dy: number, out: Hit): Hit {
    out.hit = false;
    out.travelled = 0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      out.x = x;
      out.y = y;
      return out;
    }
    const ux = dx / len;
    const uy = dy / len;
    const t = this.terrain;
    let px = x;
    let py = y;
    let rem = len;
    let probes = 0;
    while (rem > 0) {
      probes++;
      const c = this.field.clearance(px, py);
      if (c >= 1) {
        const s = c < rem ? c : rem;
        px += ux * s;
        py += uy * s;
        rem -= s;
        continue;
      }
      const s = rem < 1 ? rem : 1;
      const nx = px + ux * s;
      const ny = py + uy * s;
      const fx = Math.floor(nx);
      const fy = Math.floor(ny);
      if (t.isSolid(fx, fy)) {
        out.hit = true;
        out.cx = fx;
        out.cy = fy;
        // The occupancy normal must oppose the motion that caused the hit;
        // in pits and slots it can come out sideways, so fall back to -motion.
        if (t.normalAt(Math.floor(px), Math.floor(py), normalScratch) && normalScratch.x * ux + normalScratch.y * uy < -0.2) {
          out.nx = normalScratch.x;
          out.ny = normalScratch.y;
        } else {
          out.nx = -ux;
          out.ny = -uy;
        }
        break;
      }
      px = nx;
      py = ny;
      rem -= s;
    }
    this.probes = probes;
    out.x = px;
    out.y = py;
    out.travelled = len - rem;
    return out;
  }
}

/**
 * Contact response shared by every particle system: restitution along the
 * normal, Coulomb friction along the tangent. A body resting on a slope stays
 * put while tan(slope) <= mu * (1 + e). Sliding, piling and a real angle of
 * repose all emerge from this rule instead of being scripted per cell.
 * Mutates the velocity in `v`; returns the normal impulse magnitude.
 */
export function contact(v: { x: number; y: number }, nx: number, ny: number, e: number, mu: number): number {
  const vn = v.x * nx + v.y * ny;
  if (vn >= 0) return 0;
  const jn = -(1 + e) * vn;
  v.x += jn * nx;
  v.y += jn * ny;
  const vdot = v.x * nx + v.y * ny;
  const tx = v.x - vdot * nx;
  const ty = v.y - vdot * ny;
  const vt = Math.sqrt(tx * tx + ty * ty);
  if (vt > 0) {
    const k = Math.min(vt, mu * jn) / vt;
    v.x -= tx * k;
    v.y -= ty * k;
  }
  return jn;
}
