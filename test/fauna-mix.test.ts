import { describe, expect, it } from 'vitest';
import { GameMode } from '../src/shared/protocol.ts';
import { BeastKind, wyrm } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';

type Internals = { spawnBeast(): boolean; spawnNest(): boolean; spawnBasilisk(): boolean; beastSpawnAt: number; dungeon: unknown };

/** A world on mode `mode`'s map (seed `seed`), its creatures cleared. */
function on(mode: number, seed = 1) {
  const world = new World(seed, { mode: 'ffa', bots: 0, rotation: [mode] });
  world.beasts.fill(null);
  return { world, w: world as unknown as Internals };
}

describe('fauna on every map, in every mode', () => {
  it('a mix, always: the first crawlers up are one of each kind (cave spider, asp, millipede)', () => {
    for (const mode of [GameMode.Pvp, GameMode.Regicide, GameMode.Lms, GameMode.Extraction]) {
      const { world, w } = on(mode);
      for (let k = 0; k < 3; k++) expect(w.spawnBeast(), `mode ${mode}`).toBe(true);
      const kinds = new Set(world.beasts.filter((b) => b).map((b) => b!.kind));
      // (The spiders a pack, with their web.)
      expect([...kinds].sort(), `mode ${mode}`).toEqual([BeastKind.Millipede, BeastKind.Asp, BeastKind.Spider, BeastKind.Web].sort());
    }
  });

  it('wasps: nests (and so their seeders) on any map, the labyrinth too', () => {
    for (const mode of [GameMode.Pvp, GameMode.Regicide, GameMode.Extraction]) {
      const { world, w } = on(mode);
      expect(w.spawnNest(), `mode ${mode}`).toBe(true);
      expect(world.beasts.some((b) => b?.kind === BeastKind.Nest)).toBe(true);
    }
  });

  it('a basilisk (one, at most) may come up deep in the caves in PvP and Regicide', () => {
    for (const mode of [GameMode.Pvp, GameMode.Regicide]) {
      const { world, w } = on(mode);
      expect(w.spawnBasilisk(), `mode ${mode}`).toBe(true);
      const b = world.beasts.find((o) => o && wyrm(o.kind))!;
      expect(b.y - world.terrain.surfaceY(b.x)).toBeGreaterThanOrEqual(120);
    }
  });

  it('the labyrinth has its crawlers and wasps, but never a basilisk', () => {
    const { world, w } = on(GameMode.Extraction);
    expect(w.dungeon).toBeTruthy();
    for (let k = 0; k < 30 * 60 * 2; k++) {
      if (k % 30 === 0) w.beastSpawnAt = 0;
      world.step();
    }
    expect(world.beasts.some((b) => b && (b.kind === BeastKind.Spider || b.kind === BeastKind.Asp || b.kind === BeastKind.Millipede))).toBe(true);
    expect(world.beasts.some((b) => b?.kind === BeastKind.Nest)).toBe(true);
    expect(world.beasts.some((b) => b && wyrm(b.kind))).toBe(false);
  });
});
