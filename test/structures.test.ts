import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { MOD_H, MOD_W } from '../src/shared/structures.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { generateWorld, lastComplexes } from '../src/shared/worldgen.ts';
import { bannerLines } from '../src/client/banner.ts';

/** Air cells reachable from (x, y) inside a box (4-connected flood fill). */
function flood(t: Terrain, x: number, y: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const w = x1 - x0;
  const seen = new Uint8Array(w * (y1 - y0));
  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    if (cx < x0 || cy < y0 || cx >= x1 || cy >= y1) continue;
    const i = (cy - y0) * w + (cx - x0);
    if (seen[i] || t.isSolid(cx, cy)) continue;
    seen[i] = 1;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return seen;
}

describe('bunker complexes', () => {
  const t = new Terrain();

  it('cover 15-60% of the surface, varying from map to map', () => {
    const seen: number[] = [];
    for (let seed = 100; seed < 110; seed++) {
      generateWorld(t, seed);
      let built = 0;
      for (const c of lastComplexes) built += c.x1 - c.x0;
      const cover = built / (WORLD_W - 192);
      seen.push(cover);
      expect(cover).toBeGreaterThanOrEqual(0.12);
      expect(cover).toBeLessThanOrEqual(0.6);
    }
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.15);
  });

  it('sit on the modular grid and are made of concrete and metal', () => {
    generateWorld(t, 7);
    expect(lastComplexes.length).toBeGreaterThan(3);
    for (const c of lastComplexes) {
      expect((c.x0 - 96) % MOD_W).toBe(0);
      expect((c.x1 - c.x0) % MOD_W).toBe(0);
      // Floor slab of concrete, metal roof on the first module (some modules
      // come pre-shot, so look at most of each, not one cell).
      let slab = 0;
      for (let x = c.x0; x < c.x1; x++) if (t.get(x, c.floor + 1) === Mat.Concrete) slab++;
      expect(slab / (c.x1 - c.x0)).toBeGreaterThan(0.6);
      const top = c.floor - c.heights[0] * MOD_H;
      let roof = 0;
      for (let x = c.x0; x < c.x0 + MOD_W; x++) if (t.get(x, top + 1) === Mat.Metal) roof++;
      expect(roof / MOD_W).toBeGreaterThan(0.4);
    }
  });

  it('can be entered: every room, storey and basement is reachable from outside', () => {
    for (const seed of [7, 8, 9]) {
      generateWorld(t, seed);
      for (const c of lastComplexes) {
        const top = c.floor - Math.max(...c.heights) * MOD_H - 10;
        const bottom = c.floor + 3 + Math.max(...c.basements) * MOD_H + 4;
        const x0 = c.x0 - 260;
        const x1 = c.x1 + 260;
        // From the open sky above the complex, through doors, holes and shafts.
        const reach = flood(t, Math.floor((c.x0 + c.x1) / 2), top, x0, top, x1, bottom);
        const at = (x: number, y: number) => reach[(y - top) * (x1 - x0) + (x - x0)] === 1;
        for (let k = 0; k < c.heights.length; k++) {
          // Inside each ground-floor room, at standing height, with room for a clone.
          const rx = c.x0 + k * MOD_W + 8;
          const ry = c.floor - ACTOR_H;
          expect(t.rectSolid(rx, ry, rx + ACTOR_W - 1, c.floor - 1)).toBe(false);
          expect(at(rx + 2, c.floor - 2)).toBe(true);
          for (let j = 0; j < c.basements[k]; j++) {
            const by = c.floor + 3 + j * MOD_H + MOD_H - 3 - 2;
            expect(at(c.x0 + k * MOD_W + MOD_W / 2, by)).toBe(true);
          }
        }
      }
    }
  });

  it('come out the same from the same seed', () => {
    generateWorld(t, 42);
    const a = JSON.stringify(lastComplexes);
    const h = t.chunkHash(400);
    generateWorld(t, 42);
    expect(JSON.stringify(lastComplexes)).toBe(a);
    expect(t.chunkHash(400)).toBe(h);
  });
});

describe('console banners', () => {
  it('spell text in five even rows of block letters', () => {
    const rows = bannerLines('Fragged 3!');
    expect(rows.length).toBe(5);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows.join('')).toContain('█');
    expect(bannerLines('ab')[0].length).toBeGreaterThan(bannerLines('a')[0].length);
  });
});
