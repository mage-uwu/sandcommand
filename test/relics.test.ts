import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, cavesOf, generateWorld } from '../src/shared/worldgen.ts';
import { isPainting, placeRelics } from '../src/client/relics.ts';

describe('relics of the progenitors', () => {
  it('are rare, deep underground, in the open on a cave wall (never in a bunker), and the same for everyone', () => {
    const t = new Terrain();
    const backdrop = new Uint8Array(WORLD_W * WORLD_H);
    let total = 0;
    let none = 0;
    const maps = 12;
    for (let seed = 1; seed <= maps; seed++) {
      generateWorld(t, seed, MapKind.Plain, backdrop);
      const caves = cavesOf(seed, MapKind.Plain);
      const rs = placeRelics(t, seed, backdrop, caves);
      expect(placeRelics(t, seed, backdrop, caves)).toEqual(rs); // (every client places them alike)
      expect(rs.length).toBeLessThanOrEqual(caves ? 7 : 3);
      total += rs.length;
      if (rs.length === 0) none++;
      for (const r of rs) {
        // Well under the surface.
        expect(t.surfaceY(r.x)).toBeLessThan(r.y - 20);
        // Not in a bunker's rooms.
        expect(backdrop[r.y * WORLD_W + r.x]).toBe(0);
        // A painting hangs in the open over a floor; a relic sits in one.
        if (isPainting(r.kind)) expect(t.isSolid(r.x + 4, r.y + 4)).toBe(false);
      }
    }
    expect(total / maps).toBeLessThan(4); // rare
    expect(total).toBeGreaterThan(0); // but there
    expect(none).toBeLessThan(maps);
  });
});
