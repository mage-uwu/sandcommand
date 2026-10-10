import {
  CHUNK,
  CHUNK_SHIFT,
  CHUNKS_X,
  CHUNK_COUNT,
  TILE_SHIFT,
  TILES_X,
  TILES_Y,
  WORLD_H,
  WORLD_W,
  WORDS_PER_ROW,
} from './constants.ts';
import { MAT_ADAMANT, MAT_COUNT, MAT_FIXED, MAT_HARD, MAT_LOOSE, MAT_TOUGH, Mat } from './materials.ts';

/**
 * Destructible terrain.
 *
 * Material bytes are the source of truth for *what* a cell is, but every
 * physics query runs against four bitplanes (solid / hard / fixed / loose) packed 32
 * cells per Uint32 word. That turns the hot paths into SWAR ("SIMD within a
 * register") kernels:
 *
 *  - an AABB overlap test touches ceil(w/32) words per row instead of w bytes
 *  - a circular carve computes one span mask per row and clears up to 32 cells
 *    per AND, respecting material hardness with two more ANDs
 *  - removed cells are enumerated with clz on the removed-bits mask, so cost
 *    scales with cells actually destroyed, not with the circle's area
 *
 * Every row/word is independent, so the kernels are trivially splittable
 * across lanes or threads.
 */
export class Terrain {
  readonly mat = new Uint8Array(WORLD_W * WORLD_H);
  readonly solid = new Uint32Array(WORDS_PER_ROW * WORLD_H);
  readonly hard = new Uint32Array(WORDS_PER_ROW * WORLD_H);
  readonly fixed = new Uint32Array(WORDS_PER_ROW * WORLD_H);
  readonly loose = new Uint32Array(WORDS_PER_ROW * WORLD_H);
  /** Set when a chunk changes; the renderer clears it. */
  readonly dirty = new Uint8Array(CHUNK_COUNT);
  /** Per 16x16 tile: set when cells change; the distance field clears it. */
  readonly fieldDirty = new Uint8Array(TILES_X * TILES_Y);
  /** Scratch: cells removed by the last carve, by material. */
  readonly removedByMat = new Int32Array(MAT_COUNT);

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return Mat.Bedrock;
    return this.mat[y * WORLD_W + x];
  }

  set(x: number, y: number, m: number): void {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
    this.mat[y * WORLD_W + x] = m;
    const wi = y * WORDS_PER_ROW + (x >>> 5);
    const bit = 1 << (x & 31);
    if (m !== Mat.Air) this.solid[wi] |= bit;
    else this.solid[wi] &= ~bit;
    if (MAT_HARD[m]) this.hard[wi] |= bit;
    else this.hard[wi] &= ~bit;
    if (MAT_FIXED[m]) this.fixed[wi] |= bit;
    else this.fixed[wi] &= ~bit;
    if (MAT_LOOSE[m]) this.loose[wi] |= bit;
    else this.loose[wi] &= ~bit;
    this.dirty[(y >> CHUNK_SHIFT) * CHUNKS_X + (x >> CHUNK_SHIFT)] = 1;
    this.fieldDirty[(y >> TILE_SHIFT) * TILES_X + (x >> TILE_SHIFT)] = 1;
  }

  /** Out-of-world is solid except above the sky line. */
  isSolid(x: number, y: number): boolean {
    if (y < 0) return x < 0 || x >= WORLD_W ? true : false;
    if (x < 0 || x >= WORLD_W || y >= WORLD_H) return true;
    return (this.solid[y * WORDS_PER_ROW + (x >>> 5)] & (1 << (x & 31))) !== 0;
  }

  /** Inclusive integer rectangle overlap test against the solid plane. */
  rectSolid(x0: number, y0: number, x1: number, y1: number): boolean {
    if (x0 < 0 || x1 >= WORLD_W || y1 >= WORLD_H) return true;
    if (y0 < 0) {
      if (y1 < 0) return false;
      y0 = 0;
    }
    const w0 = x0 >>> 5;
    const w1 = x1 >>> 5;
    const loMask = -1 << (x0 & 31);
    const hiMask = -1 >>> (31 - (x1 & 31));
    const s = this.solid;
    for (let y = y0; y <= y1; y++) {
      const row = y * WORDS_PER_ROW;
      if (w0 === w1) {
        if (s[row + w0] & loMask & hiMask) return true;
      } else {
        if (s[row + w0] & loMask) return true;
        for (let w = w0 + 1; w < w1; w++) if (s[row + w]) return true;
        if (s[row + w1] & hiMask) return true;
      }
    }
    return false;
  }

  /** Count solid cells in an inclusive rectangle (popcount per word). */
  countSolid(x0: number, y0: number, x1: number, y1: number): number {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(WORLD_W - 1, x1);
    y1 = Math.min(WORLD_H - 1, y1);
    if (x0 > x1 || y0 > y1) return 0;
    const w0 = x0 >>> 5;
    const w1 = x1 >>> 5;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * WORDS_PER_ROW;
      for (let w = w0; w <= w1; w++) {
        let m = this.solid[row + w];
        if (w === w0) m &= -1 << (x0 & 31);
        if (w === w1) m &= -1 >>> (31 - (x1 & 31));
        n += popcount(m);
      }
    }
    return n;
  }

  /**
   * Carve a disc. Soft cells within `r` are removed, hard (non-fixed) cells
   * only within `coreR`, tough ones (pig iron) only within half of it, and
   * adamant ones (the Progenitors' cement) only within a quarter. Integer-only geometry so client and server agree
   * bit-for-bit. Returns number of removed cells; per-material counts are in
   * `removedByMat`. `onRemoved` is called for each removed cell (optional).
   */
  carve(
    cx: number,
    cy: number,
    r: number,
    coreR: number,
    onRemoved?: (x: number, y: number, mat: number) => void,
  ): number {
    this.removedByMat.fill(0);
    if (coreR > r) coreR = r; // the core is the inner part of the disc, never larger
    let total = 0;
    const r2 = r * r;
    const c2 = coreR * coreR;
    const toughR = coreR >> 1;
    const t2 = toughR * toughR;
    const adamantR = coreR >> 2;
    const a2 = adamantR * adamantR;
    const yA = Math.max(0, cy - r);
    const yB = Math.min(WORLD_H - 1, cy + r);
    const solid = this.solid;
    const hard = this.hard;
    const fixed = this.fixed;
    const mat = this.mat;
    for (let y = yA; y <= yB; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const span = Math.floor(Math.sqrt(r2 - dy2));
      const xa = Math.max(0, cx - span);
      const xb = Math.min(WORLD_W - 1, cx + span);
      if (xa > xb) continue;
      // Core span (may be empty).
      let ca = 1;
      let cb = 0;
      if (dy2 <= c2) {
        const cs = Math.floor(Math.sqrt(c2 - dy2));
        ca = Math.max(0, cx - cs);
        cb = Math.min(WORLD_W - 1, cx + cs);
      }
      // Tough span (may be empty).
      let ta = 1;
      let tb = 0;
      if (dy2 <= t2) {
        const ts = Math.floor(Math.sqrt(t2 - dy2));
        ta = Math.max(0, cx - ts);
        tb = Math.min(WORLD_W - 1, cx + ts);
      }
      // Adamant span (may be empty).
      let aa = 1;
      let ab = 0;
      if (dy2 <= a2) {
        const as = Math.floor(Math.sqrt(a2 - dy2));
        aa = Math.max(0, cx - as);
        ab = Math.min(WORLD_W - 1, cx + as);
      }
      const row = y * WORDS_PER_ROW;
      const w0 = xa >>> 5;
      const w1 = xb >>> 5;
      for (let w = w0; w <= w1; w++) {
        const base = w << 5;
        const mask = spanMask(xa - base, xb - base);
        const i = row + w;
        const sw = solid[i];
        if (sw === 0) continue;
        let removed = mask & sw & ~hard[i];
        if (ca <= cb) {
          let core = spanMask(ca - base, cb - base) & sw & ~fixed[i] & hard[i];
          // Tough cells outside the tough span hold, adamant ones outside the adamant span.
          const tough = ta <= tb ? spanMask(ta - base, tb - base) : 0;
          let outer = core & ~(aa <= ab ? spanMask(aa - base, ab - base) : 0);
          while (outer !== 0) {
            const b = 31 - Math.clz32(outer & -outer);
            outer &= outer - 1;
            const cm = mat[y * WORLD_W + base + b];
            if (MAT_ADAMANT[cm] || (MAT_TOUGH[cm] && !(tough & (1 << b)))) core &= ~(1 << b);
          }
          removed |= core;
        }
        if (removed === 0) continue;
        solid[i] = sw & ~removed;
        hard[i] &= ~removed;
        this.loose[i] &= ~removed;
        const rowBase = y * WORLD_W + base;
        let m = removed;
        while (m !== 0) {
          const b = 31 - Math.clz32(m & -m);
          m &= m - 1;
          const ci = rowBase + b;
          const old = mat[ci];
          mat[ci] = Mat.Air;
          this.removedByMat[old]++;
          total++;
          if (onRemoved) onRemoved(base + b, y, old);
        }
      }
    }
    if (total > 0) this.markDirtyRect(cx - r, cy - r, cx + r, cy + r);
    return total;
  }

  /**
   * Stability rule for loose material: supported from below, and on each side
   * by either the neighbour or the diagonal below it. Loose faces therefore
   * cannot stand steeper than 45 degrees. Grains use it before settling; the
   * SWAR collapse kernel below evaluates the same rule 32 cells at a time.
   */
  looseStableAt(x: number, y: number): boolean {
    return (
      this.isSolid(x, y + 1) &&
      (this.isSolid(x - 1, y + 1) || this.isSolid(x - 1, y)) &&
      (this.isSolid(x + 1, y + 1) || this.isSolid(x + 1, y))
    );
  }

  /**
   * One row of the SWAR collapse kernel. Per word the stability rule is
   *   loose & (~below | (~belowLeft & ~left) | (~belowRight & ~right))
   * with neighbours obtained by shifting bitplane words, i.e. 32 tests in a
   * handful of ALU ops. Masks for the whole range are computed before any
   * cell is removed (Jacobi order, so word order cannot matter) and the row is
   * repeated until stable. With `grow`, a cell falling at either edge of the
   * range widens it by one, so sideways peeling is followed exactly. Writes
   * the final range and the detached x extent into `rowOut`.
   */
  private detachRow(y: number, a: number, b: number, grow: boolean, onDetach: (x: number, y: number, mat: number) => void): number {
    const { solid, loose, mat } = this;
    const W = WORDS_PER_ROW;
    const row = y * W;
    let total = 0;
    let lo = WORLD_W;
    let hi = -1;
    for (let iter = 0; iter < WORLD_W; iter++) {
      const w0 = a >>> 5;
      const w1 = b >>> 5;
      let any = 0;
      for (let w = w0; w <= w1; w++) {
        const i = row + w;
        const lw = loose[i];
        if (lw === 0) {
          rowMask[w] = 0;
          continue;
        }
        const s = solid[i];
        const bw = solid[i + W];
        // Neighbour planes aligned to this word's bits; off-world counts as solid.
        const sl = (s << 1) | (w > 0 ? solid[i - 1] >>> 31 : 1);
        const sr = (s >>> 1) | (w < W - 1 ? solid[i + 1] << 31 : 1 << 31);
        const bl = (bw << 1) | (w > 0 ? solid[i + W - 1] >>> 31 : 1);
        const br = (bw >>> 1) | (w < W - 1 ? solid[i + W + 1] << 31 : 1 << 31);
        const m = lw & (~bw | (~bl & ~sl) | (~br & ~sr)) & spanMask(a - (w << 5), b - (w << 5));
        rowMask[w] = m;
        any |= m;
      }
      if (any === 0) break;
      let edge = false;
      for (let w = w0; w <= w1; w++) {
        let m = rowMask[w];
        if (m === 0) continue;
        const i = row + w;
        solid[i] &= ~m;
        loose[i] &= ~m;
        const base = w << 5;
        const rowBase = y * WORLD_W + base;
        while (m !== 0) {
          const bit = 31 - Math.clz32(m & -m);
          m &= m - 1;
          const old = mat[rowBase + bit];
          mat[rowBase + bit] = Mat.Air;
          total++;
          const x = base + bit;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
          if (x === a || x === b) edge = true;
          onDetach(x, y, old);
        }
      }
      if (grow && edge) {
        if (lo === a && a > 0) a--;
        if (hi === b && b < WORLD_W - 1) b++;
      }
    }
    rowOut.a = a;
    rowOut.b = b;
    rowOut.lo = lo;
    rowOut.hi = hi;
    return total;
  }

  /**
   * Detach every unstable loose cell in an inclusive rectangle, bottom-up
   * (worldgen stabilisation, tests). Gameplay uses collapseFrom().
   */
  detachUnsupported(x0: number, y0: number, x1: number, y1: number, onDetach: (x: number, y: number, mat: number) => void): number {
    x0 = Math.max(0, x0);
    x1 = Math.min(WORLD_W - 1, x1);
    y0 = Math.max(0, y0);
    y1 = Math.min(WORLD_H - 2, y1); // the bottom row always rests on the world floor
    if (x0 > x1 || y0 > y1) return 0;
    let total = 0;
    for (let y = y1; y >= y0; y--) total += this.detachRow(y, x0, x1, false, onDetach);
    if (total > 0) this.markDirtyRect(x0, y0, x1, y1);
    return total;
  }

  /**
   * Collapse caused by carving a disc at (cx, cy, r). Activity-driven: a row
   * is only examined around cells that changed in it or just below it (the
   * carve's span, then whatever detached), widening sideways only when a cell
   * at the edge falls, and it stops at the first row above the carve where
   * nothing fell. Cost is proportional to the collapse, not to its bounding
   * box. `ext` receives every cell the kernel read or wrote, which is what a
   * replica must hold in sync to reproduce the result.
   */
  collapseFrom(
    cx: number,
    cy: number,
    r: number,
    onDetach: (x: number, y: number, mat: number) => void,
    ext: { x0: number; y0: number; x1: number; y1: number },
  ): number {
    let total = 0;
    let lo = WORLD_W; // detached range in the row below
    let hi = -1;
    const r2 = r * r;
    let minX = WORLD_W;
    let maxX = -1;
    let minY = WORLD_H;
    let maxY = -1;
    for (let y = Math.min(WORLD_H - 2, cy + r + 1); y >= 0; y--) {
      let a = lo <= hi ? lo - 1 : WORLD_W;
      let b = lo <= hi ? hi + 1 : -1;
      for (let dy = y - cy; dy <= y + 1 - cy; dy++) {
        if (dy * dy > r2) continue;
        const span = Math.floor(Math.sqrt(r2 - dy * dy));
        if (cx - span - 1 < a) a = cx - span - 1;
        if (cx + span + 1 > b) b = cx + span + 1;
      }
      if (a > b) {
        if (y < cy - r) break; // above the carve and nothing fell below: done
        lo = WORLD_W;
        hi = -1;
        continue;
      }
      a = Math.max(0, a);
      b = Math.min(WORLD_W - 1, b);
      total += this.detachRow(y, a, b, true, onDetach);
      lo = rowOut.lo;
      hi = rowOut.hi;
      // The row kernel reads x-1..x+1 in rows y and y+1 over its final range.
      if (rowOut.a - 1 < minX) minX = rowOut.a - 1;
      if (rowOut.b + 1 > maxX) maxX = rowOut.b + 1;
      if (y < minY) minY = y;
      if (y + 1 > maxY) maxY = y + 1;
    }
    if (maxX >= 0) {
      ext.x0 = Math.min(ext.x0, minX);
      ext.x1 = Math.max(ext.x1, maxX);
      ext.y0 = Math.min(ext.y0, minY);
      ext.y1 = Math.max(ext.y1, maxY);
    }
    if (total > 0) this.markDirtyRect(minX, minY, maxX, maxY);
    return total;
  }

  /**
   * Surface normal from the gradient of local occupancy: solid-cell counts in
   * the four half-windows of a 5x5 neighbourhood (eight masked popcounts).
   * Points away from solid. Writes into `out`; returns false when the
   * neighbourhood is symmetric (no defined normal).
   */
  normalAt(x: number, y: number, out: { x: number; y: number }): boolean {
    const l = this.countSolid(x - 2, y - 2, x - 1, y + 2);
    const r = this.countSolid(x + 1, y - 2, x + 2, y + 2);
    const u = this.countSolid(x - 2, y - 2, x + 2, y - 1);
    const d = this.countSolid(x - 2, y + 1, x + 2, y + 2);
    const nx = l - r;
    const ny = u - d;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) return false;
    out.x = nx / len;
    out.y = ny / len;
    return true;
  }

  /** Re-rasterize a cell's chunk without touching physics (cosmetic stains). */
  markRenderDirty(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return;
    this.dirty[(y >> CHUNK_SHIFT) * CHUNKS_X + (x >> CHUNK_SHIFT)] = 1;
  }

  markDirtyRect(x0: number, y0: number, x1: number, y1: number): void {
    forChunksInRect(x0, y0, x1, y1, (ci) => {
      this.dirty[ci] = 1;
    });
    const tx0 = Math.max(0, x0 >> TILE_SHIFT);
    const ty0 = Math.max(0, y0 >> TILE_SHIFT);
    const tx1 = Math.min(TILES_X - 1, x1 >> TILE_SHIFT);
    const ty1 = Math.min(TILES_Y - 1, y1 >> TILE_SHIFT);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) this.fieldDirty[ty * TILES_X + tx] = 1;
  }

  /** Copy a chunk's materials into `out` (CHUNK*CHUNK bytes, row-major). */
  readChunk(ci: number, out: Uint8Array): void {
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    for (let y = 0; y < CHUNK; y++) {
      const src = (oy + y) * WORLD_W + ox;
      out.set(this.mat.subarray(src, src + CHUNK), y * CHUNK);
    }
  }

  /** Overwrite a chunk from material bytes and rebuild its bitplanes. */
  writeChunk(ci: number, data: Uint8Array): void {
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    for (let y = 0; y < CHUNK; y++) {
      const dst = (oy + y) * WORLD_W + ox;
      this.mat.set(data.subarray(y * CHUNK, y * CHUNK + CHUNK), dst);
    }
    this.rebuildPlanes(ox, oy, ox + CHUNK - 1, oy + CHUNK - 1);
    this.markDirtyRect(ox, oy, ox + CHUNK - 1, oy + CHUNK - 1);
  }

  /** Recompute bitplanes from material bytes over a word-aligned region. */
  rebuildPlanes(x0: number, y0: number, x1: number, y1: number): void {
    const w0 = x0 >>> 5;
    const w1 = x1 >>> 5;
    for (let y = y0; y <= y1; y++) {
      for (let w = w0; w <= w1; w++) {
        let s = 0;
        let h = 0;
        let f = 0;
        let l = 0;
        const base = y * WORLD_W + (w << 5);
        for (let b = 0; b < 32; b++) {
          const m = this.mat[base + b];
          if (m !== Mat.Air) s |= 1 << b;
          if (MAT_HARD[m]) h |= 1 << b;
          if (MAT_FIXED[m]) f |= 1 << b;
          if (MAT_LOOSE[m]) l |= 1 << b;
        }
        const i = y * WORDS_PER_ROW + w;
        this.solid[i] = s;
        this.hard[i] = h;
        this.fixed[i] = f;
        this.loose[i] = l;
      }
    }
  }

  rebuildAllPlanes(): void {
    this.rebuildPlanes(0, 0, WORLD_W - 1, WORLD_H - 1);
    this.dirty.fill(1);
    this.fieldDirty.fill(1);
  }

  /** First solid row at column x scanning down from `fromY`, or WORLD_H. */
  surfaceY(x: number, fromY = 0): number {
    const wi = x >>> 5;
    const bit = 1 << (x & 31);
    for (let y = Math.max(0, fromY); y < WORLD_H; y++) {
      if (this.solid[y * WORDS_PER_ROW + wi] & bit) return y;
    }
    return WORLD_H;
  }

  /** FNV-1a over a chunk's materials; used to verify replicas in tests/debug. */
  chunkHash(ci: number): number {
    const ox = (ci % CHUNKS_X) << CHUNK_SHIFT;
    const oy = Math.floor(ci / CHUNKS_X) << CHUNK_SHIFT;
    let h = 0x811c9dc5;
    for (let y = 0; y < CHUNK; y++) {
      const row = (oy + y) * WORLD_W + ox;
      for (let x = 0; x < CHUNK; x++) {
        h ^= this.mat[row + x];
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  }
}

const rowMask = new Int32Array(WORDS_PER_ROW);
const rowOut = { a: 0, b: 0, lo: 0, hi: 0 };

/** Bits a..b (inclusive) set, with a and b clamped to the 0..31 word range. */
export function spanMask(a: number, b: number): number {
  if (a < 0) a = 0;
  if (b > 31) b = 31;
  if (a > b) return 0;
  return (-1 >>> (31 - b)) & (-1 << a);
}

export function popcount(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}

export function chunkIndexAt(x: number, y: number): number {
  return (y >> CHUNK_SHIFT) * CHUNKS_X + (x >> CHUNK_SHIFT);
}

export function forChunksInRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (ci: number) => void,
): void {
  const cx0 = Math.max(0, x0 >> CHUNK_SHIFT);
  const cy0 = Math.max(0, y0 >> CHUNK_SHIFT);
  const cx1 = Math.min(CHUNKS_X - 1, x1 >> CHUNK_SHIFT);
  const cy1 = Math.min(WORLD_H / CHUNK - 1, y1 >> CHUNK_SHIFT);
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) fn(cy * CHUNKS_X + cx);
}
