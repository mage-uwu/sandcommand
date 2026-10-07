import { describe, expect, it } from 'vitest';
import { DT, WORLD_H, WORLD_W, WORDS_PER_ROW } from '../src/shared/constants.ts';
import { Collider, DistanceField, FH, FIELD_R, FIELD_SHIFT, FW, newHit } from '../src/shared/field.ts';
import { MAT_LOOSE, Mat } from '../src/shared/materials.ts';
import { Grains, applyCarve, dropToSupport, releaseCarve } from '../src/shared/particles.ts';
import { Rng } from '../src/shared/rng.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { generateWorld } from '../src/shared/worldgen.ts';

function countMat(t: Terrain, m: number): number {
  let n = 0;
  for (let i = 0; i < t.mat.length; i++) if (t.mat[i] === m) n++;
  return n;
}

/** Brute-force capped 3-4 chamfer distance with the field's edge semantics. */
function referenceField(t: Terrain): Uint8Array {
  const MAXD = FIELD_R * 3;
  const solid = new Uint8Array(FW * FH);
  for (let fy = 0; fy < FH; fy++)
    for (let fx = 0; fx < FW; fx++)
      solid[fy * FW + fx] = t.countSolid(fx << FIELD_SHIFT, fy << FIELD_SHIFT, (fx << FIELD_SHIFT) + 3, (fy << FIELD_SHIFT) + 3) > 0 ? 1 : 0;
  const out = new Uint8Array(FW * FH);
  for (let fy = 0; fy < FH; fy++) {
    for (let fx = 0; fx < FW; fx++) {
      let best = MAXD;
      for (let dy = -FIELD_R; dy <= FIELD_R; dy++) {
        for (let dx = -FIELD_R; dx <= FIELD_R; dx++) {
          const x = fx + dx;
          const y = fy + dy;
          const src = y < 0 ? false : x < 0 || x >= FW || y >= FH ? true : solid[y * FW + x] === 1;
          if (!src) continue;
          const a = Math.abs(dx);
          const b = Math.abs(dy);
          const d = 3 * Math.max(a, b) + Math.min(a, b);
          if (d < best) best = d;
        }
      }
      out[fy * FW + fx] = best;
    }
  }
  return out;
}

describe('collapse detection (SWAR)', () => {
  it('matches a naive per-cell reference of the 45-degree stability rule', () => {
    const rng = new Rng(4);
    for (let trial = 0; trial < 20; trial++) {
      const a = new Terrain();
      const b = new Terrain();
      // Random loose/solid mix in a band, with random holes.
      for (let y = 300; y < 420; y++)
        for (let x = 200; x < 330; x++) {
          const r = rng.next();
          const m = r < 0.25 ? Mat.Air : r < 0.7 ? Mat.Sand : r < 0.8 ? Mat.Rubble : Mat.Dirt;
          a.mat[y * WORLD_W + x] = m;
          b.mat[y * WORLD_W + x] = m;
        }
      a.rebuildAllPlanes();
      b.rebuildAllPlanes();
      const x0 = 200 + rng.int(60);
      const x1 = x0 + rng.int(60);
      const y0 = 300 + rng.int(60);
      const y1 = y0 + rng.int(60);
      const n = a.detachUnsupported(x0, y0, x1, y1, () => {});
      // Reference: per cell, bottom-up; each row repeats until stable, and in
      // each round every unstable cell is found before any is removed.
      let ref = 0;
      for (let y = Math.min(y1, WORLD_H - 2); y >= y0; y--) {
        for (;;) {
          const hit: number[] = [];
          for (let x = x0; x <= x1; x++) if (MAT_LOOSE[b.get(x, y)] && !b.looseStableAt(x, y)) hit.push(x);
          if (hit.length === 0) break;
          for (const x of hit) b.set(x, y, Mat.Air);
          ref += hit.length;
        }
      }
      expect(n).toBe(ref);
      expect(Buffer.compare(Buffer.from(a.mat), Buffer.from(b.mat))).toBe(0);
      expect(Buffer.compare(Buffer.from(a.loose.buffer), Buffer.from(b.loose.buffer))).toBe(0);
      expect(Buffer.compare(Buffer.from(a.solid.buffer), Buffer.from(b.solid.buffer))).toBe(0);
    }
  });
});

describe('collapse cascade', () => {
  it('a stable world stays fully stable after any sequence of carves', () => {
    const t = new Terrain();
    generateWorld(t, 21);
    const unstable = () => {
      let n = 0;
      for (let y = 0; y < WORLD_H - 1; y++)
        for (let x = 0; x < WORLD_W; x++) if (MAT_LOOSE[t.mat[y * WORLD_W + x]] && !t.looseStableAt(x, y)) n++;
      return n;
    };
    expect(unstable()).toBe(0);
    const rng = new Rng(17);
    const removed: number[] = [];
    const detached: number[] = [];
    let total = 0;
    for (let k = 0; k < 120; k++) {
      applyCarve(t, rng.int(WORLD_W), 150 + rng.int(600), 3 + rng.int(26), 6, removed, detached);
      total += detached.length / 3;
      if (k % 20 === 19) expect(unstable()).toBe(0);
    }
    expect(total).toBeGreaterThan(1000); // collapses really happened
  });
});

describe('distance field', () => {
  it('incremental updates equal a brute-force field after many edits', () => {
    const t = new Terrain();
    generateWorld(t, 8);
    const f = new DistanceField(t);
    f.update();
    expect(Buffer.compare(Buffer.from(f.d), Buffer.from(referenceField(t)))).toBe(0);
    const rng = new Rng(2);
    const removed: number[] = [];
    const detached: number[] = [];
    for (let k = 0; k < 60; k++) {
      if (rng.next() < 0.6) applyCarve(t, rng.int(WORLD_W), 200 + rng.int(600), 4 + rng.int(28), 6, removed, detached);
      else for (let j = 0; j < 30; j++) t.set(rng.int(WORLD_W), rng.int(WORLD_H), Mat.Rubble);
      if (k % 7 === 0) f.update(); // several edits may batch between updates
    }
    f.update();
    expect(Buffer.compare(Buffer.from(f.d), Buffer.from(referenceField(t)))).toBe(0);
  });
});

describe('swept collider', () => {
  it('never ends inside terrain and never tunnels through 1-cell walls', () => {
    const t = new Terrain();
    // Thin walls every 40 cells.
    for (let x = 100; x < WORLD_W - 100; x += 40) for (let y = 100; y < 900; y++) t.set(x, y, Mat.Rock);
    const f = new DistanceField(t);
    f.update();
    const col = new Collider(t, f);
    const h = newHit();
    const rng = new Rng(5);
    for (let k = 0; k < 20000; k++) {
      const x = 101 + rng.next() * 1700;
      const y = 150 + rng.next() * 700; // walls span y 100..899; stay clear of their ends
      if (t.isSolid(Math.floor(x), Math.floor(y))) continue;
      const dx = (rng.next() - 0.5) * 80;
      const dy = (rng.next() - 0.5) * 80;
      col.sweep(x, y, dx, dy, h);
      expect(t.isSolid(Math.floor(h.x), Math.floor(h.y))).toBe(false);
      // Crossing a wall column means a hit must have been reported.
      const wallBetween = Math.floor((x - 100) / 40) !== Math.floor((x + dx - 100) / 40);
      if (wallBetween) expect(h.hit).toBe(true);
    }
  });

  it('crosses open space in a few probes', () => {
    const t = new Terrain();
    for (let x = 0; x < WORLD_W; x++) t.set(x, 900, Mat.Rock);
    const f = new DistanceField(t);
    f.update();
    const col = new Collider(t, f);
    col.sweep(500, 200, 0, 30, newHit());
    expect(col.probes).toBeLessThanOrEqual(2); // vs 30 per-cell steps
  });
});

describe('falling sand', () => {
  for (const cap of [65536, 100]) it(`a collapse conserves material and leaves no unsupported loose cell (grain capacity ${cap})`, () => {
    const t = new Terrain();
    // Bedrock floor, a dirt shelf, and a tall sand mound on top of it.
    for (let x = 0; x < WORLD_W; x++) for (let y = 700; y < WORLD_H; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
    for (let x = 400; x < 700; x++) for (let y = 600; y < 640; y++) t.mat[y * WORLD_W + x] = Mat.Dirt;
    for (let x = 450; x < 650; x++) for (let y = 520; y < 600; y++) t.mat[y * WORLD_W + x] = Mat.Sand;
    t.rebuildAllPlanes();
    const f = new DistanceField(t);
    const col = new Collider(t, f);
    const grains = new Grains(cap);
    const sandBefore = countMat(t, Mat.Sand);

    // Blow out the shelf under the middle of the mound.
    const removed: number[] = [];
    const detached: number[] = [];
    const carved = applyCarve(t, 550, 612, 24, 0, removed, detached);
    const sandCarved = removed.filter((_, i) => i % 3 === 2 && removed[i] === Mat.Sand).length;
    expect(carved).toBeGreaterThan(0);
    expect(detached.length / 3).toBeGreaterThan(500); // the mound above caves in
    releaseCarve(grains, removed, detached, 550, 612, 0, new Rng(1), (x, y, m) => dropToSupport(t, x, y, m, (a, b, c) => t.set(a, b, c)));

    let lost = 0;
    for (let tick = 0; tick < 30 * 15 && grains.n > 0; tick++) {
      f.update();
      const before = grains.n;
      let settled = 0;
      grains.step(col, DT, (x, y, m) => {
        t.set(x, y, m);
        settled++;
      });
      lost += before - grains.n - settled;
    }
    expect(grains.n).toBe(0);
    expect(lost).toBe(0);
    expect(countMat(t, Mat.Sand)).toBe(sandBefore - sandCarved);

    // Stability: every loose cell rests on something.
    let unsupported = 0;
    for (let y = 0; y < WORLD_H - 1; y++) {
      for (let w = 0; w < WORDS_PER_ROW; w++) {
        const i = y * WORDS_PER_ROW + w;
        if (t.loose[i] & ~t.solid[i + WORDS_PER_ROW]) unsupported++;
      }
    }
    expect(unsupported).toBe(0);
  });
});
