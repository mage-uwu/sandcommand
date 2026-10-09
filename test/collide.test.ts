import { describe, expect, it } from 'vitest';
import { ACTOR_H, ACTOR_W, WORLD_W } from '../src/shared/constants.ts';
import { SHIP_H, SHIP_HP, SHIP_W, newShip } from '../src/shared/dropship.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team } from '../src/shared/protocol.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** Two clones on a flat floor. */
function pair(seed: number) {
  const world = new World(seed);
  const a = world.addPlayer('a', { send() {} })!;
  const b = world.addPlayer('b', { send() {} })!;
  deliverAll(world, [a, b]);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < FLOOR + 40; y++) t.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
  world.terrainReplaced();
  const put = (p: Player, x: number, vx = 0, air = 0) => {
    p.body.x = x;
    p.body.y = FLOOR - ACTOR_H - air;
    p.body.vx = vx;
    p.body.vy = 0;
  };
  return { world, a, b, put };
}
const gap = (a: Player, b: Player) => Math.abs(b.body.x - a.body.x);

describe('collisions', () => {
  it('enemy clones are pushed apart; teammates can share a spot', () => {
    const { world, a, b, put } = pair(111);
    put(a, 1000);
    put(b, 1003);
    world.step();
    world.step();
    expect(gap(a, b)).toBeGreaterThanOrEqual(ACTOR_W - 1);
    a.team = b.team = Team.Red;
    put(a, 2000);
    put(b, 2003);
    world.step();
    expect(gap(a, b)).toBeLessThan(ACTOR_W - 2);
  });

  it('a gentle bump does no harm; a jetpack ram hurts both and knocks the other back', () => {
    const { world, a, b, put } = pair(112);
    put(a, 1000, 60);
    put(b, 1009, 0);
    for (let k = 0; k < 4; k++) world.step();
    expect(a.hp).toBe(100);
    expect(b.hp).toBe(100);
    put(a, 1500, 480, 120); // jetting in hard, mid-air
    put(b, 1512, 0, 120);
    for (let k = 0; k < 3; k++) world.step();
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
    expect(b.body.vx).toBeGreaterThan(30); // shoved on
    expect(b.lastHitBy).toBe(a.id);
  });

  it('a dropship sweeping into an enemy bounces them off its hull and both take damage; its caller passes through', () => {
    const { world, a, b, put } = pair(113);
    // b jetting high in the open; a's ship sweeping into it, guns silent.
    put(b, 1500, 0, 150);
    const sh = newShip(1500 + ACTOR_W / 2 - SHIP_W / 2 - 6, FLOOR - 150 - ACTOR_H / 2 - SHIP_H / 2 - 4, a.id, a.team);
    sh.vx = 260;
    sh.gunCd = [99, 99];
    sh.bombs = 0;
    world.ships[0] = sh;
    const hp0 = b.hp;
    world.step();
    expect(b.hp).toBeLessThan(hp0);
    expect(sh.hp).toBeLessThan(SHIP_HP);
    expect(Math.hypot(b.body.vx, b.body.vy)).toBeGreaterThan(100);
    // The caller standing in their own ship: nothing.
    world.ships[0] = null;
    put(a, 2500, 0, 150);
    const own = newShip(2500 + ACTOR_W / 2 - SHIP_W / 2, FLOOR - 150 - ACTOR_H / 2 - SHIP_H / 2 - 4, a.id, a.team);
    own.vx = 260;
    own.gunCd = [99, 99];
    world.ships[1] = own;
    world.step();
    expect(a.hp).toBe(100);
    expect(own.hp).toBe(SHIP_HP);
  });
});
