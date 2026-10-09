import { describe, expect, it } from 'vitest';
import { BTN_RIGHT } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H, WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { CallKind, WATCHDOG_COST } from '../src/shared/protocol.ts';
import { TANK_W, WATCHDOG_SCALE, isDog, tankMaxHp, tankW } from '../src/shared/tank.ts';
import { WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A flat yard, a clone with a radio and the gold for a watchdog, and (optionally) an enemy off to its right. */
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
  // The enemy far off (out of the fight) unless placed.
  place(b, enemyAt ?? 2600);
  a.gold = WATCHDOG_COST;
  world.equip(a, WeaponId.Radio);
  world.step();
  return { world, a, b };
}

/** Call the watchdog in and wait for it to land. */
function callDog(world: World, a: Player) {
  expect(world.call(a.id, CallKind.Watchdog)).toBe(true);
  const slot = world.tanks.findIndex((t) => t !== null && isDog(t));
  const dog = world.tanks[slot]!;
  for (let k = 0; k < 30 * 12 && dog.chute; k++) {
    // (Keep the owner where we put it: it's the dog that should move.)
    a.body.x = 1000;
    world.step();
  }
  expect(dog.chute).toBe(false);
  return { slot, dog };
}

const centre = (t: { x: number; s: number }) => t.x + tankW(t) / 2;

describe('the watchdog', () => {
  it('is a radio purchase: a small tank, two-thirds the size and strength, one each', () => {
    const { world, a } = yard(301);
    const { dog } = callDog(world, a);
    expect(a.gold).toBe(0);
    expect(dog.owner).toBe(a.id);
    expect(dog.s).toBeCloseTo(WATCHDOG_SCALE, 5);
    expect(tankW(dog)).toBe(Math.round(TANK_W * WATCHDOG_SCALE));
    expect(dog.hp).toBeCloseTo(tankMaxHp(dog), 0);
    expect(tankMaxHp(dog) / tankMaxHp({ s: 1 })).toBeCloseTo(2 / 3, 5);
    a.gold = 99999;
    a.callCd = 0;
    expect(world.call(a.id, CallKind.Watchdog)).toBe(false); // already has one
    // Nobody can climb into it.
    expect(dog.pilot).toBe(255);
  });

  it('stays at its owner\'s heel with nothing about', () => {
    const { world, a } = yard(302);
    const { dog } = callDog(world, a);
    for (let k = 0; k < 30 * 6; k++) world.step();
    expect(Math.abs(centre(dog) - a.cx)).toBeLessThan(60);
  });

  it('gets between its owner and an enemy, and opens fire', () => {
    const { world, a, b } = yard(303, 1260);
    const { dog } = callDog(world, a);
    for (let k = 0; k < 30 * 6 && b.alive; k++) {
      b.body.x = 1260; // the enemy holds its ground
      world.step();
    }
    expect(centre(dog)).toBeGreaterThan(a.cx + 10);
    expect(centre(dog)).toBeLessThan(1260);
    expect(!b.alive || b.hp < 100).toBe(true);
    expect(a.hp).toBe(100); // it never shot its owner
  });

  it('can be driven by remote (P) while the clone stands inert, and handed back', () => {
    const { world, a } = yard(304);
    const { slot, dog } = callDog(world, a);
    expect(world.call(a.id, CallKind.Pilot)).toBe(true);
    expect(a.rc).toBe(slot);
    expect(dog.pilot).toBe(a.id);
    const x0 = dog.x;
    const bx = a.body.x;
    for (let k = 0; k < 30 * 3; k++) {
      a.buttons = BTN_RIGHT;
      world.step();
    }
    a.buttons = 0;
    expect(dog.x - x0).toBeGreaterThan(100);
    expect(Math.abs(a.body.x - bx)).toBeLessThan(2);
    expect(world.call(a.id, CallKind.Pilot)).toBe(true);
    expect(a.rc).toBe(-1);
    expect(dog.pilot).toBe(255);
    // Back on its own, it comes home.
    for (let k = 0; k < 30 * 8; k++) world.step();
    expect(Math.abs(centre(dog) - a.cx)).toBeLessThan(70);
  });

  it('blown up under remote control, it takes nobody with it', () => {
    const { world, a } = yard(305);
    const { slot } = callDog(world, a);
    world.call(a.id, CallKind.Pilot);
    a.body.x = 1700; // (well clear of the blast)
    (world as unknown as { destroyTank(slot: number, by: number): void }).destroyTank(slot, 255);
    world.step();
    expect(world.tanks[slot]).toBe(null);
    expect(a.alive).toBe(true);
    expect(a.rc).toBe(-1);
  });

  it('shuts down when its owner leaves', () => {
    const { world, a } = yard(306);
    const { slot } = callDog(world, a);
    world.removePlayer(a.id);
    world.step();
    expect(world.tanks[slot]).toBe(null);
  });
});
