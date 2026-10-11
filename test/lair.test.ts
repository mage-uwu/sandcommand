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
  it('one giant cave deep under open ground, in chambers (a den on each floor), two or three chutes down into it', () => {
    for (const seed of [101, 202, 303]) {
      const t = new Terrain();
      generateWorld(t, seed, MapKind.Lair);
      const lair = lastLair!;
      expect(lair.dens.length).toBe(LAIR_DENS);
      expect(lair.mouths.length).toBeGreaterThanOrEqual(2);
      expect(lair.mouths.length).toBeLessThanOrEqual(3);
      // Most of the map's width.
      expect(lair.x1 - lair.x0).toBeGreaterThan(WORLD_W * 0.8);
      const open = reachable(t);
      for (const d of lair.dens) {
        expect(d.floorY).toBeGreaterThan(t.surfaceY(d.x) + 150);
        // Its floor: open, rock under it, room over it (a basilisk lies there), and reachable from the sky (down a chute, through the cave).
        expect(t.isSolid(d.floorX, d.floorY)).toBe(false);
        expect(t.isSolid(d.floorX, d.floorY + 1)).toBe(true);
        for (let k = 1; k < 30; k++) expect(t.isSolid(d.floorX, d.floorY - k)).toBe(false);
        expect(open[d.floorY * WORLD_W + d.floorX], `seed ${seed} den at ${d.x}`).toBe(1);
      }
      // A big open hall: most of the columns across it are open over 120 cells tall at the middle.
      let tall = 0;
      for (let x = lair.x0 + 200; x < lair.x1 - 200; x += 20) {
        let run = 0;
        let best = 0;
        for (let y = lair.roof[x]; y <= lair.floor[x]; y++) {
          run = t.isSolid(x, y) ? 0 : run + 1;
          best = Math.max(best, run);
        }
        if (best > 120) tall++;
      }
      expect(tall).toBeGreaterThan(((lair.x1 - lair.x0 - 400) / 20) * 0.6);
      // Each chute: open from the surface down into the cave's roof.
      for (const mx of lair.mouths) {
        let y = t.surfaceY(mx - 40) - 2;
        expect(open[(y + 20) * WORLD_W + mx]).toBe(1);
      }
    }
  });
});
