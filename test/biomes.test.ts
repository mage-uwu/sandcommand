import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { Biome, MapKind, biomeOf, generateWorld, lastBiome } from '../src/shared/worldgen.ts';

/** The first seed (from 1) whose ordinary map is `biome`. */
const seedFor = (biome: number) => {
  for (let s = 1; ; s++) if (biomeOf(s, MapKind.Plain) === biome) return s;
};
/** Per column: the top cell's material and its height. */
function surface(t: Terrain) {
  const tops: number[] = [];
  const mats: number[] = [];
  for (let x = 8; x < WORLD_W - 8; x += 2) {
    const y = t.surfaceY(x);
    tops.push(y);
    mats.push(t.get(x, y));
  }
  return { tops, mats, frac: (m: number) => mats.filter((v) => v === m).length / mats.length };
}

describe('biomes', () => {
  it('every ordinary map is one of four, by its seed; fortresses want gentle ground; the labyrinth is under a desert', () => {
    const seen = new Set<number>();
    for (let s = 1; s < 200; s++) seen.add(biomeOf(s, MapKind.Plain));
    expect([...seen].sort()).toEqual([Biome.Dunes, Biome.Canyons, Biome.Highlands, Biome.Meadows]);
    for (let s = 1; s < 60; s++) expect([Biome.Dunes, Biome.Meadows]).toContain(biomeOf(s, MapKind.Fortress));
    for (let s = 1; s < 20; s++) expect(biomeOf(s, MapKind.Dungeon)).toBe(Biome.Dunes);
  });

  const t = new Terrain();

  it('canyons: a flat plateau cut by deep ravines', () => {
    generateWorld(t, seedFor(Biome.Canyons));
    expect(lastBiome).toBe(Biome.Canyons);
    const { tops } = surface(t);
    const sorted = [...tops].sort((a, b) => a - b);
    const plateau = sorted[Math.floor(sorted.length * 0.3)];
    const deep = tops.filter((y) => y > plateau + 120).length / tops.length;
    expect(deep).toBeGreaterThan(0.04); // ravines
    expect(deep).toBeLessThan(0.5); // mostly plateau
  });

  it('highlands: tall ridged peaks, snow on top', () => {
    generateWorld(t, seedFor(Biome.Highlands));
    const { tops, frac } = surface(t);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(220);
    expect(frac(Mat.Snow)).toBeGreaterThan(0.02);
  });

  it('meadows are mostly grass; the desert has only patches', () => {
    generateWorld(t, seedFor(Biome.Meadows));
    const meadow = surface(t).frac(Mat.Grass);
    expect(meadow).toBeGreaterThan(0.35);
    generateWorld(t, seedFor(Biome.Dunes));
    const dunes = surface(t);
    expect(dunes.frac(Mat.Grass)).toBeGreaterThan(0.01);
    expect(dunes.frac(Mat.Grass)).toBeLessThan(meadow);
    expect(dunes.frac(Mat.Sand)).toBeGreaterThan(0.3);
  });

  it('frosting is only on natural ground, never on a bunker', () => {
    for (const b of [Biome.Meadows, Biome.Highlands]) {
      generateWorld(t, seedFor(b));
      for (let x = 8; x < WORLD_W - 8; x++) {
        for (let y = 1; y < 900; y++) {
          const m = t.get(x, y);
          if (m !== Mat.Grass && m !== Mat.Snow) continue;
          const below = t.get(x, y + 1);
          expect(below === Mat.Concrete || below === Mat.Metal).toBe(false);
        }
      }
    }
  });
});
