import { describe, expect, it } from 'vitest';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { W_SPIDER } from '../src/shared/particles.ts';
import { ASP_HP, BEAST_BUILD, BeastKind, CSPIDER_FREEZE_MIN, CSPIDER_HP, MILLI_HUNT, bodyPoints, crawler, newBeast } from '../src/shared/wildlife.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

/** A cave: solid rock, a tunnel (x 880..1260, y 380..440), a clone standing on its floor at x 960. */
function cave(seed = 7) {
  const world = new World(seed);
  (world as unknown as { beastSpawnAt: number }).beastSpawnAt = 1e9; // (only the ones we put there)
  const a = world.addPlayer('a', { send() {} })!;
  deliverAll(world, [a]);
  const t = world.terrain;
  for (let y = 300; y < 520; y++) for (let x = 760; x < 1400; x++) t.set(x, y, x >= 880 && x <= 1260 && y >= 380 && y <= 440 ? Mat.Air : Mat.Rock);
  world.terrainReplaced();
  resetBody(a.parts, ClassId.Medium, 0);
  a.hp = 100;
  a.body.x = 960;
  a.body.y = 441 - ACTOR_H;
  a.body.vx = a.body.vy = 0;
  world.beasts.fill(null);
  return { world, a };
}
const putSpider = (world: World, x: number, y: number, dir: number) => {
  const b = newBeast(world.terrain, BeastKind.Spider, x, y, dir);
  world.beasts[1] = b;
  bodyPoints(world.terrain, b, world.beastPts[1]);
  return b;
};
/** Hold the clone where they are (the target, not the chase), unhurt. */
const hold = (a: ReturnType<typeof cave>['a']) => {
  a.body.x = 960;
  a.body.y = 441 - ACTOR_H;
  a.body.vx = a.body.vy = 0;
};

describe('the cave spider', () => {
  it('a crawler, about a clone in size (a head and a fat abdomen), tougher than an asp', () => {
    expect(crawler(BeastKind.Spider)).toBe(true);
    expect(BEAST_BUILD[BeastKind.Spider].hp).toBe(CSPIDER_HP);
    expect(CSPIDER_HP).toBeGreaterThan(ASP_HP * 2);
    const { world } = cave();
    putSpider(world, 1150, 440, 1);
    expect(world.beastPts[1].length).toBe(4);
  });

  it('with nobody about it wanders, then freezes still on the rock and waits', () => {
    const { world, a } = cave();
    // The clone walled off (out of sight).
    for (let y = 380; y <= 440; y++) for (let x = 1000; x < 1010; x++) world.terrain.set(x, y, Mat.Rock);
    world.terrainReplaced();
    const b = putSpider(world, 1150, 440, 1);
    b.wander = 30;
    for (let k = 0; k < 90 && b.frozen === 0; k++) world.step();
    expect(b.frozen).toBeGreaterThanOrEqual(CSPIDER_FREEZE_MIN - 90);
    const at = [...world.beastPts[1]];
    for (let k = 0; k < 30 * 8; k++) world.step();
    expect(world.beastPts[1]).toEqual(at); // (not a twitch)
    void a;
  });

  it('prey in sight: it wakes and runs at them, far faster than a millipede hunts, and bites: a heavy bite and a shove', () => {
    const { world, a } = cave();
    const b = putSpider(world, 1220, 440, -1);
    b.frozen = 30 * 60;
    bodyPoints(world.terrain, b, world.beastPts[1]);
    const x0 = world.beastPts[1][0];
    // A second in: well on its way (more than a millipede's hunting pace would carry it).
    for (let k = 0; k < 30; k++) {
      hold(a);
      world.step();
    }
    expect(b.frozen).toBe(0);
    expect(x0 - world.beastPts[1][0]).toBeGreaterThan(MILLI_HUNT * 1.2);
    let bitten = false;
    for (let k = 0; k < 30 * 5 && !bitten; k++) {
      hold(a);
      const hp = a.hp;
      world.step();
      if (a.hp < hp - 10) {
        bitten = true;
        expect(Math.abs(a.body.vx)).toBeGreaterThan(30);
      }
    }
    expect(bitten).toBe(true);
    expect(a.lastWeapon).toBe(W_SPIDER);
  });

  it('it closes the last stretch with a dash, or leaps at them through the air, fangs out', () => {
    let dashed = false;
    let leapt = false;
    for (const seed of [7, 8, 9]) {
      const { world, a } = cave(seed);
      const b = putSpider(world, 1100, 440, -1);
      for (let k = 0; k < 30 * 6 && !(dashed && leapt); k++) {
        hold(a);
        a.hp = 100;
        world.step();
        if (b.lunge > 0) dashed = true;
        if (b.flung > 0) leapt = true;
        if (b.lunge > 0 || b.flung > 0) expect(b.lift).toBeGreaterThan(0);
      }
    }
    expect(dashed).toBe(true);
    expect(leapt).toBe(true);
  });

  it('unarmoured but tough for its size: it takes well over a dozen rifle rounds', () => {
    const { world, a } = cave();
    putSpider(world, 1100, 440, -1);
    world.beasts[1]!.frozen = 30 * 600;
    // (Out of reach: walled off from the clone but for a slot to shoot through.)
    let shots = 0;
    for (let k = 0; k < 80 && world.beasts[1]; k++) {
      const pts = world.beastPts[1];
      const ang = Math.atan2(pts[1] - a.cy, pts[0] - a.cx);
      (world as unknown as { spawnProj(id: number, kind: number, owner: number, x: number, y: number, vx: number, vy: number): void }).spawnProj(80000 + k, ProjKind.Bullet, a.id, a.cx, a.cy, Math.cos(ang) * 900, Math.sin(ang) * 900);
      shots++;
      world.step();
      hold(a);
      a.hp = 100;
    }
    expect(world.beasts[1]).toBe(null);
    expect(shots).toBeGreaterThan(12);
    expect(shots).toBeLessThan(40);
  });

  it('they come up in the caves among the millipedes and asps', () => {
    const kinds = new Set<number>();
    for (const seed of [12, 13, 14]) {
      const world = new World(seed);
      world.beasts.fill(null);
      for (let k = 0; k < 10; k++) (world as unknown as { spawnBeast(): boolean }).spawnBeast();
      for (const b of world.beasts) if (b) kinds.add(b.kind);
    }
    expect(kinds.has(BeastKind.Spider)).toBe(true);
    expect(kinds.has(BeastKind.Millipede)).toBe(true);
    expect(kinds.has(BeastKind.Asp)).toBe(true);
  });
});
