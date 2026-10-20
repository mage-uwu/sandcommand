import { hash2 } from '../src/shared/rng.ts';
import { MapKind } from '../src/shared/worldgen.ts';
import type { Player, World } from '../src/server/world.ts';

/** Step until every listed player has been delivered by drop rocket. */
export function deliverAll(world: World, players: Player[], maxTicks = 1200): number {
  for (let t = 0; t < maxTicks; t++) {
    if (players.every((p) => p.alive)) return t;
    world.step();
  }
  throw new Error('drop rockets never delivered everyone');
}

/** The first seed from `seed` on whose map Extermination is fought on `kind` (the lair, or DUNE: World.mapKindFor). */
export const seedFor = (seed: number, kind: number): number => {
  for (let s = seed; ; s++) if ((hash2(s & 0xffff, s >>> 16, 0xd0e5) & 1 ? MapKind.Dune : MapKind.Lair) === kind) return s;
};
