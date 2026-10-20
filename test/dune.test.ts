import { describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { GameMode, Phase } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { BeastKind, wyrm } from '../src/shared/wildlife.ts';
import { MapKind, generateWorld, lastComplexes, lastCraters, lastFlora, lastGeysers, lastLair } from '../src/shared/worldgen.ts';
import { World } from '../src/server/world.ts';
import { seedFor } from './helpers.ts';

const until = (world: World, cond: () => boolean, max = 3000) => {
  for (let t = 0; t < max && !cond(); t++) world.step();
};

describe('DUNE', () => {
  it('a vast barren desert: towering dunes of loose sand, nothing built, no caves, no life', () => {
    const t = new Terrain();
    generateWorld(t, 4242, MapKind.Dune);
    expect(lastComplexes.length).toBe(0);
    expect(lastLair).toBe(null);
    expect(lastCraters.length + lastGeysers.length + lastFlora.length).toBe(0);
    let lo = Infinity;
    let hi = -Infinity;
    let air = 0;
    let sand = 0;
    for (let x = 20; x < WORLD_W - 20; x += 7) {
      const s = t.surfaceY(x);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
      if (t.get(x, s + 3) === Mat.RustSand) sand++;
      // (No cave under it: solid ground from the surface down, all the way.)
      for (let y = s + 2; y < WORLD_H - 12; y += 5) if (!t.isSolid(x, y)) air++;
    }
    expect(hi - lo).toBeGreaterThan(120); // (towering dunes)
    expect(sand / ((WORLD_W - 40) / 7)).toBeGreaterThan(0.95);
    expect(air).toBe(0);
  });

  it('Extermination is fought there half the time (by the map seed)', () => {
    let dune = 0;
    for (let s = 1; s <= 400; s++) if (seedFor(s, MapKind.Dune) === s) dune++;
    expect(dune).toBeGreaterThan(150);
    expect(dune).toBeLessThan(250);
  });

  it('two dragons, awake under the sand; nothing else living; the heavy weapons out on the sand', () => {
    const world = new World(seedFor(500, MapKind.Dune), { mode: 'ffa', rotation: [GameMode.Extermination], tanks: false, bots: 0 });
    const a = world.addPlayer('a', { send() {} })!;
    world.addPlayer('b', { send() {} });
    until(world, () => world.phase === Phase.Live);
    expect(world.mapKind).toBe(MapKind.Dune);
    expect(world.lair).toBe(null);
    const ws = world.beasts.filter((b) => b && wyrm(b.kind));
    expect(ws.length).toBe(2);
    for (const b of ws) {
      expect(b!.kind).toBe(BeastKind.Dragon);
      expect(b!.frenzy).toBeGreaterThan(0);
      expect(b!.frozen).toBe(0);
    }
    expect(world.beasts.filter(Boolean).length).toBe(2);
    expect(world.mapLoot.filter((l) => l.weapon === WeaponId.Bazooka).length).toBeGreaterThanOrEqual(4);
    // (A while on, still nothing else has come.)
    for (let t = 0; t < 30 * 20; t++) world.step();
    expect(world.beasts.filter((b) => b && !wyrm(b.kind) && b.kind !== BeastKind.Millipede && b.kind !== BeastKind.Asp).length).toBe(0);
    expect(a).toBeTruthy();
  });

  it('they come up after whoever walks the sand, however far, and never go back to sleep', () => {
    const world = new World(seedFor(700, MapKind.Dune), { mode: 'ffa', rotation: [GameMode.Extermination], tanks: false, bots: 0 });
    const a = world.addPlayer('a', { send() {} })!;
    const b2 = world.addPlayer('b', { send() {} })!;
    until(world, () => world.phase === Phase.Live);
    until(world, () => a.alive && b2.alive, 1200);
    const ws = world.beasts.filter((b) => b && wyrm(b.kind))!;
    // Out on the sand, well away from both.
    const x = Math.round(WORLD_W * 0.5);
    let near = Infinity;
    let hurt = false;
    let surfaced = false;
    for (let t = 0; t < 30 * 60 && !hurt; t++) {
      if (!a.alive) break;
      a.body.x = x;
      a.body.y = world.terrain.surfaceY(x) - 15;
      a.body.vx = a.body.vy = 0;
      if (a.hp < 100) hurt = true;
      a.hp = 100;
      world.step();
      for (const b of ws) {
        if (!b) continue;
        near = Math.min(near, Math.hypot(b.fx - a.cx, b.fy - a.cy));
        if (b.fy < world.terrain.surfaceY(Math.round(b.fx)) + 10) surfaced = true;
      }
    }
    // Up out of the sand, and on them (its jaws, its breath of burning blood, its brood).
    expect(surfaced).toBe(true);
    expect(hurt || near < 120).toBe(true);
    for (const b of ws) expect(b!.frenzy).toBeGreaterThan(0);
  });
});
