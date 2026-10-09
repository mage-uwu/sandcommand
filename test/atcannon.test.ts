import { describe, expect, it } from 'vitest';
import { WORLD_W } from '../src/shared/constants.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team } from '../src/shared/protocol.ts';
import { TANK_H, TANK_HP, TANK_W, newTank } from '../src/shared/tank.ts';
import { PROJ, ProjKind, WEAPONS, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A flat, open yard (and two clones: a shooter and a tank driver). */
function range(seed: number) {
  const world = new World(seed);
  const a = world.addPlayer('gunner', { send() {} })!;
  const b = world.addPlayer('driver', { send() {} })!;
  deliverAll(world, [a, b]);
  const t = world.terrain;
  for (let x = 0; x < WORLD_W; x++) for (let y = 0; y < FLOOR + 60; y++) t.set(x, y, y >= FLOOR ? Mat.Bedrock : Mat.Air);
  world.terrainReplaced();
  // The tank on the floor at x 1400, driven by b.
  const tank = newTank(1400, FLOOR - TANK_H);
  tank.chute = false;
  tank.onGround = true;
  tank.pilot = b.id;
  world.tanks[0] = tank;
  (b as Player).tank = 0;
  return { world, a, b, tank };
}

/** Fire an AT missile from (x, y) along +x; step until it ends (or `max` ticks). */
function fire(world: World, owner: Player, x: number, y: number, max = 150): { minY: number; maxY: number } {
  world.projectiles.spawn(77001, ProjKind.Missile, owner.id, x, y, WEAPONS[WeaponId.ATCannon].speed, 0);
  let minY = y;
  let maxY = y;
  for (let k = 0; k < max && world.projectiles.indexOf(77001) >= 0; k++) {
    world.step();
    const i = world.projectiles.indexOf(77001);
    if (i >= 0) {
      minY = Math.min(minY, world.projectiles.y[i]);
      maxY = Math.max(maxY, world.projectiles.y[i]);
    }
  }
  return { minY, maxY };
}

describe('AT cannon', () => {
  it('one missile a load, and a long, long reload', () => {
    const def = WEAPONS[WeaponId.ATCannon];
    expect(def.name).toBe('AT Cannon');
    expect(def.clip).toBe(1);
    expect(def.reload).toBeGreaterThanOrEqual(240); // 8 s or more
    expect(PROJ[def.proj].seek).toBeGreaterThan(0);
  });

  it('the missile seeks a tank off its line and takes about half its hull', () => {
    const { world, a, tank } = range(101);
    // Fired level, well above the tank: it would sail clean over.
    fire(world, a, 1100, FLOOR - TANK_H - 80);
    expect(world.projectiles.indexOf(77001)).toBe(-1);
    const lost = (TANK_HP - tank.hp) / TANK_HP;
    expect(lost).toBeGreaterThan(0.38);
    expect(lost).toBeLessThan(0.7);
  });

  it('with nothing hot to chase it flies straight', () => {
    const { world, a } = range(102);
    world.tanks[0] = null;
    const y = FLOOR - 120;
    const path = fire(world, a, 600, y, 40);
    expect(path.maxY - path.minY).toBeLessThan(4);
  });

  it("won't chase its own side's tank", () => {
    const { world, a, b, tank } = range(103);
    a.team = b.team = Team.Red;
    const y = FLOOR - TANK_H - 80;
    fire(world, a, 1100, y, 60);
    expect(tank.hp).toBe(TANK_HP);
    void TANK_W;
  });
});
