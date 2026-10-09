import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_RIGHT, BTN_SCOPE } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, ACTOR_W, DT, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { CallKind, TARANTULA_COST, WATCHDOG_COST, quantizeAim } from '../src/shared/protocol.ts';
import { TANK_HP, TARANTULA_SCALE, TankKind, TankPart, isPet, isSpider, newTarantula, stepTank, tankH, tankMaxHp, tankPartAt, tankW } from '../src/shared/tank.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A flat yard, a clone with a radio and the gold for a tarantula, and an enemy (far off unless placed). */
function yard(seed: number, enemyAt?: number) {
  const world = new World(seed);
  const a = world.addPlayer('owner', { send() {} })!;
  const b = world.addPlayer('enemy', { send() {} })!;
  deliverAll(world, [a, b]);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < FLOOR + 60; y++) t.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
  world.terrainReplaced();
  const place = (p: Player, x: number) => {
    resetBody(p.parts, ClassId.Medium, 0);
    p.hp = 100;
    p.body.x = x;
    p.body.y = FLOOR - ACTOR_H;
    p.body.vx = p.body.vy = 0;
  };
  place(a, 1000);
  place(b, enemyAt ?? 2600);
  a.gold = TARANTULA_COST;
  world.equip(a, WeaponId.Radio);
  world.step();
  return { world, a, b };
}

/** Call the tarantula in and wait for it to land. */
function callSpider(world: World, a: Player) {
  expect(world.call(a.id, CallKind.Tarantula)).toBe(true);
  const slot = world.tanks.findIndex((t) => t !== null && isSpider(t));
  const spider = world.tanks[slot]!;
  for (let k = 0; k < 30 * 14 && spider.chute; k++) {
    a.body.x = 1000;
    world.step();
  }
  expect(spider.chute).toBe(false);
  return { slot, spider };
}

const centre = (t: { x: number; s: number; kind: number }) => t.x + tankW(t) / 2;

describe('the tarantula', () => {
  it('is a radio purchase for 3000: a spider droid three times over, twice a tank\'s hull, one each', () => {
    const { world, a } = yard(401);
    a.gold = TARANTULA_COST - 1;
    expect(world.call(a.id, CallKind.Tarantula)).toBe(false); // can't afford it
    a.gold = TARANTULA_COST;
    const { spider } = callSpider(world, a);
    expect(a.gold).toBe(0);
    expect(spider.kind).toBe(TankKind.Tarantula);
    expect(spider.owner).toBe(a.id);
    expect(tankW(spider)).toBe(ACTOR_W * TARANTULA_SCALE);
    expect(tankH(spider)).toBe(ACTOR_H * TARANTULA_SCALE);
    expect(tankMaxHp(spider)).toBe(TANK_HP * 2);
    expect(spider.hp).toBeCloseTo(tankMaxHp(spider), 0);
    expect(spider.pilot).toBe(255); // nobody climbs in
    // One each; a watchdog besides is fine.
    a.gold = 99999;
    a.callCd = 0;
    expect(world.call(a.id, CallKind.Tarantula)).toBe(false);
    expect(world.call(a.id, CallKind.Watchdog)).toBe(true);
    expect(a.gold).toBe(99999 - WATCHDOG_COST);
  });

  it('walks straight up a sheer wall and over the top', () => {
    const t = new Terrain();
    for (let x = 0; x < WORLD_W; x++) for (let y = 600; y < 620; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
    for (let x = 540; x < 900; x++) for (let y = 520; y < 600; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
    t.rebuildAllPlanes();
    const s = newTarantula(450, 600 - ACTOR_H * TARANTULA_SCALE, 0);
    s.chute = false;
    s.onGround = true;
    s.pilot = 0;
    for (let k = 0; k < 30 * 5; k++) stepTank(s, t, DT, BTN_RIGHT);
    expect(s.y + tankH(s)).toBeLessThanOrEqual(520 + 1); // up on the plateau
    expect(s.x).toBeGreaterThan(540);
    expect(s.a).toBe(0); // its legs keep it level
  });

  it('is hit in its laser head, its missile rack, its plating; shots pass under its belly', () => {
    const spider = newTarantula(0, 0, 0);
    expect(tankPartAt(spider, 4, 3)).toBe(TankPart.Smg);
    expect(tankPartAt(spider, 0.5, 6)).toBe(TankPart.Cannon);
    expect(tankPartAt(spider, 4, 9)).toBe(TankPart.Armor);
    expect(tankPartAt({ ...spider, parts: 1 }, 4, 11)).toBe(TankPart.Hull);
    // A round flying just over the ground, under it, goes straight through between its legs.
    // (From the far side: its owner is at its heel on this one.)
    const { world, a, b } = yard(402);
    const { slot } = callSpider(world, a);
    const t = world.tanks[slot]!;
    const before = () => [t.hp, ...t.partHp].join();
    const whole = before();
    world.projectiles.spawn(77001, ProjKind.Bullet, b.id, t.x + tankW(t) + 30, FLOOR - 3, -900, 0);
    for (let k = 0; k < 6; k++) world.step();
    expect(before()).toBe(whole);
    world.projectiles.spawn(77002, ProjKind.Bullet, b.id, t.x + tankW(t) + 30, t.y + tankH(t) * 0.7, -900, 0);
    for (let k = 0; k < 6; k++) world.step();
    expect(before()).not.toBe(whole);
  });

  it('guards its owner: out toward an enemy, laser and missiles both, and never its owner', () => {
    const { world, a, b } = yard(403, 1320);
    const { spider } = callSpider(world, a);
    const pr = world.projectiles;
    const missiles = new Set<number>();
    let beams = 0;
    for (let k = 0; k < 30 * 4; k++) {
      // A tough target that keeps getting up, to keep shooting at.
      b.body.x = 1320;
      b.alive = true;
      b.hp = 100;
      resetBody(b.parts, ClassId.Heavy, 0);
      world.step();
      if (spider.firedSmg) beams++;
      for (let i = 0; i < pr.n; i++) if (pr.kind[i] === ProjKind.SpiderMissile && pr.owner[i] === a.id) missiles.add(pr.id[i]);
    }
    expect(beams).toBeGreaterThan(10); // an automatic laser: five beams a second
    expect(missiles.size).toBeGreaterThan(5); // and a stream of missiles
    expect(centre(spider)).toBeGreaterThan(a.cx + 10);
    expect(a.hp).toBe(100);
  });

  it('can be driven by remote: P cycles watchdog, tarantula, then back to the clone', () => {
    const { world, a } = yard(404);
    const { slot } = callSpider(world, a);
    a.gold = WATCHDOG_COST;
    a.callCd = 0;
    expect(world.call(a.id, CallKind.Watchdog)).toBe(true);
    const dogSlot = world.tanks.findIndex((t) => t !== null && isPet(t) && !isSpider(t));
    const dog = world.tanks[dogSlot]!;
    for (let k = 0; k < 30 * 12 && dog.chute; k++) world.step();
    world.call(a.id, CallKind.Pilot);
    expect(a.rc).toBe(dogSlot);
    world.call(a.id, CallKind.Pilot);
    expect(a.rc).toBe(slot);
    const t = world.tanks[slot]!;
    expect(t.pilot).toBe(a.id);
    // Click: the laser; right mouse: missiles.
    a.aimQ = quantizeAim(-0.3);
    let beams = 0;
    const pr = world.projectiles;
    const seen = new Set<number>();
    const x0 = t.x;
    for (let k = 0; k < 30 * 2; k++) {
      a.buttons = BTN_FIRE | BTN_SCOPE | BTN_RIGHT;
      world.step();
      if (t.firedSmg) beams++;
      for (let i = 0; i < pr.n; i++) if (pr.kind[i] === ProjKind.SpiderMissile && pr.owner[i] === a.id) seen.add(pr.id[i]);
    }
    a.buttons = 0;
    expect(beams).toBeGreaterThan(5);
    expect(seen.size).toBeGreaterThan(3);
    expect(t.x - x0).toBeGreaterThan(60);
    world.call(a.id, CallKind.Pilot);
    expect(a.rc).toBe(-1);
    expect(t.pilot).toBe(255);
  });

  it('shuts down when its owner leaves', () => {
    const { world, a } = yard(405);
    const { slot } = callSpider(world, a);
    world.removePlayer(a.id);
    world.step();
    expect(world.tanks[slot]).toBe(null);
  });
});
