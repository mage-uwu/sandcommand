import { describe, expect, it } from 'vitest';
import { Reader, Writer, rleDecode, rleEncode } from '../src/shared/codec.ts';
import { CHUNK, CHUNK_COUNT, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { MAT_FIXED, MAT_HARD, Mat } from '../src/shared/materials.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain, popcount, spanMask } from '../src/shared/terrain.ts';
import { generateWorld } from '../src/shared/worldgen.ts';

function randomTerrain(seed: number): Terrain {
  const t = new Terrain();
  const rng = new Rng(seed);
  for (let i = 0; i < t.mat.length; i++) {
    const r = rng.next();
    t.mat[i] = r < 0.3 ? Mat.Air : r < 0.6 ? Mat.Dirt : r < 0.75 ? Mat.Rock : r < 0.85 ? Mat.Gold : r < 0.9 ? Mat.Bedrock : Mat.Sand;
  }
  t.rebuildAllPlanes();
  return t;
}

describe('bit helpers', () => {
  it('spanMask covers inclusive ranges', () => {
    expect(spanMask(0, 31) >>> 0).toBe(0xffffffff);
    expect(spanMask(0, 0)).toBe(1);
    expect(spanMask(31, 31) >>> 0).toBe(0x80000000);
    expect(spanMask(4, 7)).toBe(0xf0);
    expect(spanMask(-5, 2)).toBe(7);
    expect(spanMask(5, 4)).toBe(0);
  });
  it('popcount', () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(-1)).toBe(32);
    expect(popcount(0x80000001 | 0)).toBe(2);
  });
});

describe('SWAR terrain queries match a naive byte scan', () => {
  const t = randomTerrain(7);
  const naiveRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (t.isSolid(x, y)) return true;
    return false;
  };
  it('rectSolid / countSolid', () => {
    const rng = new Rng(99);
    // Sparse world so rects are frequently empty.
    const sparse = new Terrain();
    for (let i = 0; i < 4000; i++) sparse.set(rng.int(WORLD_W), rng.int(WORLD_H), Mat.Dirt);
    for (let i = 0; i < 3000; i++) {
      const x0 = rng.int(WORLD_W - 80);
      const y0 = rng.int(WORLD_H - 80);
      const x1 = x0 + rng.int(70);
      const y1 = y0 + rng.int(70);
      let naive = false;
      let count = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (sparse.isSolid(x, y)) {
            naive = true;
            count++;
          }
      expect(sparse.rectSolid(x0, y0, x1, y1)).toBe(naive);
      expect(sparse.countSolid(x0, y0, x1, y1)).toBe(count);
      expect(t.rectSolid(x0, y0, x1, y1)).toBe(naiveRect(x0, y0, x1, y1));
    }
  });
});

describe('carve', () => {
  it('matches a per-cell reference implementation including hardness', () => {
    const a = randomTerrain(3);
    const b = randomTerrain(3);
    const rng = new Rng(5);
    for (let k = 0; k < 200; k++) {
      const cx = rng.int(WORLD_W);
      const cy = rng.int(WORLD_H);
      const r = 1 + rng.int(30);
      const core = rng.int(r);
      const removed: number[] = [];
      const n = a.carve(cx, cy, r, core, (x, y, m) => removed.push(x, y, m));
      // reference
      let ref = 0;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= WORLD_H) continue;
        const dy = y - cy;
        const span = Math.floor(Math.sqrt(r * r - dy * dy));
        const cs = dy * dy <= core * core ? Math.floor(Math.sqrt(core * core - dy * dy)) : -1;
        for (let x = cx - span; x <= cx + span; x++) {
          if (x < 0 || x >= WORLD_W) continue;
          const m = b.get(x, y);
          if (m === Mat.Air) continue;
          const inCore = cs >= 0 && x >= cx - cs && x <= cx + cs;
          if ((!MAT_HARD[m]) || (inCore && !MAT_FIXED[m])) {
            b.set(x, y, Mat.Air);
            ref++;
          }
        }
      }
      expect(n).toBe(ref);
      expect(removed.length).toBe(n * 3);
    }
    expect(Buffer.from(a.mat).equals(Buffer.from(b.mat))).toBe(true);
    expect(Buffer.from(new Uint8Array(a.solid.buffer)).equals(Buffer.from(new Uint8Array(b.solid.buffer)))).toBe(true);
    expect(Buffer.from(new Uint8Array(a.hard.buffer)).equals(Buffer.from(new Uint8Array(b.hard.buffer)))).toBe(true);
  });
});

describe('chunk codec', () => {
  it('RLE round-trips every chunk of a generated world', () => {
    const t = new Terrain();
    generateWorld(t, 42);
    const w = new Writer();
    const src = new Uint8Array(CHUNK * CHUNK);
    const dst = new Uint8Array(CHUNK * CHUNK);
    let total = 0;
    for (let ci = 0; ci < CHUNK_COUNT; ci++) {
      t.readChunk(ci, src);
      w.reset();
      rleEncode(w, src);
      total += w.pos;
      rleDecode(new Reader(w.finish()), dst);
      if (Buffer.compare(dst, src) !== 0) throw new Error(`chunk ${ci} mismatch`);
    }
    // Whole 2-megacell world should compress well below 1 byte/cell.
    expect(total).toBeLessThan((WORLD_W * WORLD_H) / 4);
  });

  it('writeChunk rebuilds bitplanes', () => {
    const a = new Terrain();
    generateWorld(a, 1);
    const b = new Terrain();
    const buf = new Uint8Array(CHUNK * CHUNK);
    for (let ci = 0; ci < CHUNK_COUNT; ci++) {
      a.readChunk(ci, buf);
      b.writeChunk(ci, buf);
    }
    const bytes = (u: Uint32Array) => Buffer.from(u.buffer);
    expect(Buffer.compare(bytes(b.solid), bytes(a.solid))).toBe(0);
    expect(Buffer.compare(bytes(b.hard), bytes(a.hard))).toBe(0);
    expect(Buffer.compare(bytes(b.fixed), bytes(a.fixed))).toBe(0);
  });
});
