import type { Player, World } from '../src/server/world.ts';

/** Step until every listed player has been delivered by drop rocket. */
export function deliverAll(world: World, players: Player[], maxTicks = 1200): number {
  for (let t = 0; t < maxTicks; t++) {
    if (players.every((p) => p.alive)) return t;
    world.step();
  }
  throw new Error('drop rockets never delivered everyone');
}
