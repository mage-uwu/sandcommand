import { describe, expect, it } from 'vitest';
import { BTN_RIGHT, BTN_UP, newBody, stepBody } from '../src/shared/actor.ts';
import { CLASSES, ClassId, DROID_LEGS, DROID_MASK, DroidPart, has, mobility, newBodyState, newStrike, partAt, resetBody, rollClass, strike, harm } from '../src/shared/body.ts';
import { ACTOR_H, DT, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { TANK_HP } from '../src/shared/tank.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { PROJ, ProjKind } from '../src/shared/weapons.ts';

const RIFLE = PROJ[ProjKind.Bullet].mass * PROJ[ProjKind.Bullet].sharp * 880;
const FLOOR = 600;

/** Flat ground with a sheer cliff `h` cells tall from x 540 on (a plateau). */
function wallWorld(h: number): Terrain {
  const t = new Terrain();
  for (let x = 0; x < WORLD_W; x++) for (let y = FLOOR; y < FLOOR + 20; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
  for (let x = 540; x < 900; x++) for (let y = FLOOR - h; y < FLOOR; y++) t.mat[y * WORLD_W + x] = Mat.Bedrock;
  t.rebuildAllPlanes();
  return t;
}

function body(cls: number) {
  const b = newBody(500, FLOOR - ACTOR_H);
  b.cls = cls;
  const parts = newBodyState(cls);
  const mob = mobility(parts.mask, { legs: 0, jet: false, canFire: false, oneHanded: false }, cls);
  b.legs = mob.legs;
  b.jet = mob.jet;
  b.onGround = true;
  return b;
}

describe('the spider droid', () => {
  it('is a class of its own: a turret, a chassis, plating and six legs; no jetpack', () => {
    const s = newBodyState(ClassId.Droid);
    expect(s.mask).toBe(DROID_MASK);
    expect(DROID_LEGS.length).toBe(6);
    const mob = mobility(s.mask, { legs: 0, jet: true, canFire: false, oneHanded: true }, ClassId.Droid);
    expect(mob).toEqual({ legs: 2, jet: false, canFire: true, oneHanded: false });
    // Now and then a fresh clone rolls one.
    let droids = 0;
    for (let i = 0; i < 1000; i++) if (rollClass(i / 1000) === ClassId.Droid) droids++;
    expect(droids).toBeGreaterThan(30);
    expect(droids).toBeLessThan(120);
  });

  it('is fast', () => {
    const t = wallWorld(0);
    const run = (cls: number) => {
      const b = body(cls);
      for (let k = 0; k < 20; k++) stepBody(b, BTN_RIGHT, t, DT);
      return b.x - 500;
    };
    expect(run(ClassId.Droid)).toBeGreaterThan(run(ClassId.Scout) * 1.2);
    expect(CLASSES[ClassId.Droid].run).toBeGreaterThan(CLASSES[ClassId.Scout].run);
  });

  it('walks straight up a sheer wall and over the top; a clone can only jump at it', () => {
    const t = wallWorld(60);
    const go = (cls: number) => {
      const b = body(cls);
      for (let k = 0; k < 30 * 3; k++) stepBody(b, BTN_RIGHT, t, DT);
      return b;
    };
    const d = go(ClassId.Droid);
    expect(d.y + ACTOR_H).toBeLessThan(FLOOR - 60 + 1); // on top of it
    expect(d.x).toBeGreaterThan(540);
    const c = go(ClassId.Medium);
    expect(c.x).toBeLessThan(540); // still at the foot
  });

  it('climbs a wall beside it holding up (a shaft, say)', () => {
    const t = wallWorld(80);
    const b = body(ClassId.Droid);
    b.x = 536 - 8; // a few cells short of the wall
    for (let k = 0; k < 30 * 2; k++) stepBody(b, BTN_UP, t, DT);
    expect(b.y).toBeLessThan(FLOOR - ACTOR_H - 70);
  });

  it('is about a quarter of a tank: well over a hundred rifle rounds to the body', () => {
    const s = newBodyState(ClassId.Droid);
    let hp = 100;
    let rounds = 0;
    while (has(s.mask, DroidPart.Chassis) && rounds < 1000) {
      const r = newStrike();
      strike(s, partAt(s.mask, 4, 6, false, ClassId.Droid), RIFLE, PROJ[ProjKind.Bullet].damage, r);
      hp -= r.hp;
      rounds++;
    }
    expect(rounds).toBeGreaterThan(90);
    expect(rounds).toBeLessThan(160);
    // (Its health is the chassis's: gone when the chassis is.)
    expect(hp).toBeLessThan(5);
    // A quarter of a tank's hull, in rifle rounds: 7500 / 16 / 4 = 117.
    expect(Math.abs(rounds - TANK_HP / PROJ[ProjKind.Bullet].damage / 4)).toBeLessThan(40);
  });

  it('loses legs one by one, and slows as it does', () => {
    const s = newBodyState(ClassId.Droid);
    resetBody(s, ClassId.Droid);
    const mob = { legs: 0, jet: false, canFire: false, oneHanded: false };
    // Shoot the legs: each comes off by itself.
    for (const leg of DROID_LEGS.slice(0, 3)) {
      for (let k = 0; k < 40 && has(s.mask, leg); k++) strike(s, leg, RIFLE, PROJ[ProjKind.Bullet].damage, newStrike());
      expect(has(s.mask, leg)).toBe(false);
    }
    expect(mobility(s.mask, mob, ClassId.Droid).legs).toBe(1);
    // A blast shakes the rest, but a leg is a leg: no blood, no stumps.
    harm(s, DroidPart.L1, 10, newStrike());
    for (const leg of DROID_LEGS.slice(3)) for (let k = 0; k < 40 && has(s.mask, leg); k++) strike(s, leg, RIFLE, 16, newStrike());
    expect(mobility(s.mask, mob, ClassId.Droid).legs).toBe(0);
    expect(has(s.mask, DroidPart.Chassis)).toBe(true); // still alive, dragging itself
  });

  it('shot in the turret it can no longer fire, but lives', () => {
    const s = newBodyState(ClassId.Droid);
    for (let k = 0; k < 40 && has(s.mask, DroidPart.Turret); k++) strike(s, DroidPart.Turret, RIFLE, 16, newStrike());
    const mob = mobility(s.mask, { legs: 0, jet: false, canFire: true, oneHanded: false }, ClassId.Droid);
    expect(mob.canFire).toBe(false);
    expect(has(s.mask, DroidPart.Chassis)).toBe(true);
  });
});

describe('a droid destroyed', () => {
  it('scraps into flying metal on every client: legs, plates, its turret; sparks, no blood', async () => {
    const { World } = await import('../src/server/world.ts');
    const { Game } = await import('../src/client/game.ts');
    const { Reader } = await import('../src/shared/codec.ts');
    const { PK } = await import('../src/shared/particles.ts');
    const { deliverAll } = await import('./helpers.ts');
    const world = new World(41);
    const inbox: Uint8Array[] = [];
    const watcher = new Game();
    const a = world.addPlayer('watcher', { send: (d) => inbox.push(d) })!;
    const b = world.addPlayer('droid', { send() {} })!;
    watcher.myId = a.id;
    deliverAll(world, [a, b]);
    resetBody(b.parts, ClassId.Droid, 0);
    b.body.cls = ClassId.Droid;
    a.body.x = b.body.x + 20;
    a.body.y = b.body.y;
    world.step();
    (world as unknown as { damage: (v: unknown, n: number, by: number, w: number) => void }).damage(b, 500, a.id, 1);
    expect(b.alive).toBe(false);
    world.step();
    for (const f of inbox) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      watcher.applyFrame(tick, ack, r);
    }
    expect(watcher.particles.count(PK.Gib)).toBeGreaterThanOrEqual(6 + 2); // its legs and plates at least
    expect(watcher.particles.count(PK.Blood)).toBe(0);
    expect(watcher.feed.at(-1)?.text).toContain('droid scrapped');
  });
});
