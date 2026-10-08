import { describe, expect, it } from 'vitest';
import { BTN_DOWN, BTN_RIGHT, BTN_UP, PRONE_TICKS, STANCE_H, Stance, newBody, shoulderAt, stepBody } from '../src/shared/actor.ts';
import { ACTOR_H, ACTOR_RUN_SPEED, DT, WORLD_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Terrain } from '../src/shared/terrain.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;
function flat(): Terrain {
  const t = new Terrain();
  for (let y = FLOOR; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) t.set(x, y, Mat.Bedrock);
  t.rebuildAllPlanes();
  return t;
}
const standing = (t: Terrain) => {
  const b = newBody(500, FLOOR - ACTOR_H);
  for (let k = 0; k < 5; k++) stepBody(b, 0, t, DT);
  return b;
};

describe('stance', () => {
  it('down crouches at once, goes prone if held, and standing up again on release', () => {
    const t = flat();
    const b = standing(t);
    const feet = b.y;
    stepBody(b, BTN_DOWN, t, DT);
    expect(b.stance).toBe(Stance.Crouch);
    for (let k = 0; k < PRONE_TICKS; k++) stepBody(b, BTN_DOWN, t, DT);
    expect(b.stance).toBe(Stance.Prone);
    expect(b.y).toBeCloseTo(feet, 6); // feet stay put
    stepBody(b, 0, t, DT);
    expect(b.stance).toBe(Stance.Stand);
  });

  it("can't stand up where there's no headroom", () => {
    const t = flat();
    const b = standing(t);
    for (let k = 0; k <= PRONE_TICKS; k++) stepBody(b, BTN_DOWN, t, DT);
    // A low ceiling 8 cells over the floor: room to lie, not to crouch or stand.
    for (let x = 480; x < 540; x++) for (let y = FLOOR - 30; y < FLOOR - 8; y++) t.set(x, y, Mat.Bedrock);
    t.rebuildAllPlanes();
    for (let k = 0; k < 10; k++) stepBody(b, 0, t, DT);
    expect(b.stance).toBe(Stance.Prone);
    // Crawl out from under it, then up.
    for (let k = 0; k < 90; k++) stepBody(b, BTN_RIGHT, t, DT);
    expect(b.x).toBeGreaterThan(540);
    expect(b.stance).toBe(Stance.Stand);
  });

  it('crouching slows a run, crawling prone more', () => {
    const t = flat();
    const speed = (buttons: number) => {
      const b = standing(t);
      for (let k = 0; k < 40; k++) stepBody(b, buttons, t, DT);
      return Math.abs(b.vx);
    };
    const run = speed(BTN_RIGHT);
    const crawl = speed(BTN_RIGHT | BTN_DOWN);
    expect(run).toBeGreaterThan(ACTOR_RUN_SPEED * 0.9);
    expect(crawl).toBeLessThan(run * 0.4);
  });

  it('crouching on the jetpack swings the thrust forward into a dash', () => {
    const t = flat();
    const fly = (buttons: number) => {
      const b = standing(t);
      b.y -= 100; // in the air
      b.onGround = false;
      b.vx = 40;
      for (let k = 0; k < 20; k++) stepBody(b, buttons, t, DT);
      return b;
    };
    const straight = fly(BTN_UP | BTN_RIGHT);
    const dash = fly(BTN_UP | BTN_RIGHT | BTN_DOWN);
    expect(dash.vx).toBeGreaterThan(ACTOR_RUN_SPEED * 1.5); // far past running speed
    expect(dash.vx).toBeGreaterThan(straight.vx * 1.5);
    expect(dash.vy).toBeGreaterThan(straight.vy); // and climbs less
    expect(dash.stance).toBe(Stance.Crouch); // tucked, never prone in the air
  });

  it('a prone clone ducks under a shot at standing chest height, and shoots from low', () => {
    const world = new World(71);
    const shooter = world.addPlayer('shooter', { send() {} })!;
    const target = world.addPlayer('target', { send() {} })!;
    deliverAll(world, [shooter, target]);
    const t = world.terrain;
    for (let x = 800; x < 1200; x++) {
      for (let y = FLOOR; y < FLOOR + 10; y++) t.set(x, y, Mat.Bedrock);
      for (let y = FLOOR - 120; y < FLOOR; y++) t.set(x, y, Mat.Air);
    }
    world.terrainReplaced();
    target.body.x = 1000;
    target.body.y = FLOOR - ACTOR_H;
    shooter.body.x = 900;
    shooter.body.y = FLOOR - ACTOR_H;
    let seq = 0;
    for (let k = 0; k < PRONE_TICKS + 4; k++) {
      world.input(target.id, { seq: ++seq, buttons: BTN_DOWN, aim: quantizeAim(Math.PI), inv: 0 });
      world.step();
    }
    expect(target.body.stance).toBe(Stance.Prone);
    expect(STANCE_H[Stance.Prone]).toBeLessThan(ACTOR_H / 2);
    const hp0 = target.hp;
    // A rifle round across at standing chest height (5 below the top of a standing clone).
    for (let k = 0; k < 4; k++) {
      world.projectiles.spawn(6000 + k, ProjKind.Bullet, shooter.id, 960, FLOOR - ACTOR_H + 5, 880, 0);
      world.input(target.id, { seq: ++seq, buttons: BTN_DOWN, aim: quantizeAim(Math.PI), inv: 0 });
      world.step();
      world.step();
    }
    expect(target.hp).toBe(hp0);
    // Prone, the shoulder (and so the muzzle) sits a hand's width off the floor.
    const sh = shoulderAt(target.body.x, target.body.y, Stance.Prone, true, { x: 0, y: 0 });
    expect(FLOOR - sh.y).toBeLessThan(5);
  });
});
