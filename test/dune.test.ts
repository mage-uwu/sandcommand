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
  it('a vast barren desert: towering dunes of limestone under a thin skin of sand, nothing built, no caves, no life', () => {
    const t = new Terrain();
    generateWorld(t, 4242, MapKind.Dune);
    expect(lastComplexes.length).toBe(0);
    expect(lastLair).toBe(null);
    expect(lastCraters.length + lastGeysers.length + lastFlora.length).toBe(0);
    let lo = Infinity;
    let hi = -Infinity;
    let air = 0;
    let sand = 0;
    let lime = 0;
    let skin = 0;
    for (let x = 20; x < WORLD_W - 20; x += 7) {
      const s = t.surfaceY(x);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
      if (t.get(x, s) === Mat.RustSand) sand++;
      if (t.get(x, s + 10) === Mat.Limestone && t.get(x, s + 40) === Mat.Limestone) lime++;
      // (The sand only a skin: a few cells.)
      let d = 0;
      while (t.get(x, s + d) === Mat.RustSand) d++;
      skin = Math.max(skin, d);
      // (No cave under it: solid ground from the surface down, all the way.)
      for (let y = s + 2; y < WORLD_H - 12; y += 5) if (!t.isSolid(x, y)) air++;
    }
    expect(hi - lo).toBeGreaterThan(120); // (towering dunes)
    const cols = (WORLD_W - 40) / 7;
    expect(sand / cols).toBeGreaterThan(0.9);
    expect(lime / cols).toBeGreaterThan(0.95);
    expect(skin).toBeLessThanOrEqual(6);
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

  it("a dragon boring through the dunes leaves a tunnel, not a landslide; and nothing that's nobody's hurts it", () => {
    const world = new World(seedFor(900, MapKind.Dune), { mode: 'ffa', rotation: [GameMode.Extermination], tanks: false, bots: 0 });
    world.addPlayer('a', { send() {} });
    world.addPlayer('b', { send() {} });
    until(world, () => world.phase === Phase.Live);
    const k = world.beasts.findIndex((b) => b && b.kind === BeastKind.Dragon);
    const b = world.beasts[k]!;
    const hp = b.hp;
    // Nobody's harm (the sand, its own burning blood): none taken. A clone's: taken.
    world.hurtBeast(k, 5000, 255);
    expect(b.hp).toBe(hp);
    world.hurtBeast(k, 100, 0);
    expect(b.hp).toBe(hp - 100);
    // A while of it boring about: hardly any loose sand on the move.
    let loose = 0;
    for (let t = 0; t < 30 * 20; t++) {
      world.step();
      if (t % 30 === 0) loose = Math.max(loose, world.grains.n);
    }
    expect(loose).toBeLessThan(3000);
  });
});
