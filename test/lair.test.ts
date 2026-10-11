import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { LAIR_DENS } from '../src/shared/lair.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { MapKind, generateWorld, lastLair } from '../src/shared/worldgen.ts';

/** Every open cell reachable from the open sky (4-neighbour flood). */
function reachable(t: Terrain): Uint8Array {
  const seen = new Uint8Array(WORLD_W * WORLD_H);
  const q: number[] = [];
  for (let x = 0; x < WORLD_W; x++) if (!t.isSolid(x, 0)) {
    seen[x] = 1;
    q.push(x);
  }
  while (q.length) {
    const i = q.pop()!;
    const x = i % WORLD_W;
    const y = (i / WORLD_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) continue;
      const j = ny * WORLD_W + nx;
      if (seen[j] || t.isSolid(nx, ny)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

describe('the lair (Extermination)', () => {
  it('four great dens deep under open ground, each reached by a broad tunnel from the surface', () => {
    for (const seed of [101, 202, 303]) {
      const t = new Terrain();
      generateWorld(t, seed, MapKind.Lair);
      const lair = lastLair!;
      expect(lair.dens.length).toBe(LAIR_DENS);
      const open = reachable(t);
      for (const d of lair.dens) {
        expect(d.floorY).toBeGreaterThan(t.surfaceY(d.x) + 150);
        // Its floor: open, rock under it, room over it (a basilisk lies there), and reachable from the sky.
        expect(t.isSolid(d.floorX, d.floorY)).toBe(false);
        expect(t.isSolid(d.floorX, d.floorY + 1)).toBe(true);
        for (let k = 1; k < 30; k++) expect(t.isSolid(d.floorX, d.floorY - k)).toBe(false);
        expect(open[d.floorY * WORLD_W + d.floorX], `seed ${seed} den at ${d.x}`).toBe(1);
      }
    }
  });
});
