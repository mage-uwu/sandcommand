import {
  CHUNK,
  CHUNK_SHIFT,
  CHUNKS_X,
  CHUNK_COUNT,
  WORLD_H,
  WORLD_W,
  WORDS_PER_ROW,
} from './constants.ts';
import { MAT_COUNT, MAT_FIXED, MAT_HARD, Mat } from './materials.ts';

/**
 * Destructible terrain.
 *
 * Material bytes are the source of truth for *what* a cell is, but every
 * physics query runs against three bitplanes (solid / hard / fixed) packed 32
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
  /** Set when a chunk changes; consumers (renderer) clear it. */
  readonly dirty = new Uint8Array(CHUNK_COUNT);
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
    this.dirty[(y >> CHUNK_SHIFT) * CHUNKS_X + (x >> CHUNK_SHIFT)] = 1;
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
   * only within `coreR`. Integer-only geometry so client and server agree
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
    let total = 0;
    const r2 = r * r;
    const c2 = coreR * coreR;
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
        if (ca <= cb) removed |= spanMask(ca - base, cb - base) & sw & ~fixed[i];
        if (removed === 0) continue;
        solid[i] = sw & ~removed;
        hard[i] &= ~removed;
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

  markDirtyRect(x0: number, y0: number, x1: number, y1: number): void {
    forChunksInRect(x0, y0, x1, y1, (ci) => {
      this.dirty[ci] = 1;
    });
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
    this.dirty[ci] = 1;
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
        const base = y * WORLD_W + (w << 5);
        for (let b = 0; b < 32; b++) {
          const m = this.mat[base + b];
          if (m !== Mat.Air) s |= 1 << b;
          if (MAT_HARD[m]) h |= 1 << b;
          if (MAT_FIXED[m]) f |= 1 << b;
        }
        const i = y * WORDS_PER_ROW + w;
        this.solid[i] = s;
        this.hard[i] = h;
        this.fixed[i] = f;
      }
    }
  }

  rebuildAllPlanes(): void {
    this.rebuildPlanes(0, 0, WORLD_W - 1, WORLD_H - 1);
    this.dirty.fill(1);
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
