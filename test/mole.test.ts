import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_SCOPE } from '../src/shared/actor.ts';
import { ClassId, resetBody } from '../src/shared/body.ts';
import { ACTOR_H } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { CallKind, MOLE_COST, Team, quantizeAim } from '../src/shared/protocol.ts';
import { MOLE_FRILL_HP, MOLE_HP, MOLE_PLASMA_INTERVAL, MOLE_SMG_INTERVAL, SMG_INTERVAL, TANK_HP, TANK_W, TankKind, TankPart, hasTankPart, isMole, newMole, surfCapacity, tankH, tankW } from '../src/shared/tank.ts';
import { PROJ, ProjKind, WeaponId } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

function yard(world: World): void {
  const t = world.terrain;
  for (let x = 200; x < 2600; x++) {
    for (let y = 40; y < FLOOR; y++) t.set(x, y, Mat.Air);
    for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
}

let seq = 0;
function send(world: World, p: Player, buttons: number, aim = 0, pickup = false): void {
  world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: invByte(p.slot, p.invVersion, pickup) });
}
function tapPickup(world: World, p: Player): void {
  send(world, p, 0, 0, true);
  world.step();
  send(world, p, 0, 0, false);
  world.step();
}
const place = (p: Player, x: number) => {
  resetBody(p.parts, ClassId.Medium, 0);
  p.hp = 100;
  p.body.x = x;
  p.body.y = FLOOR - ACTOR_H;
  p.body.vx = p.body.vy = 0;
};

/** A yard, a mole driven (facing right) by the first player; the others placed and teamed as given. */
function setup(seed: number, teams: number[], xs: number[]) {
  const world = new World(seed);
  const ps = teams.map((_, i) => world.addPlayer(`p${i}`, { send() {} })!);
  deliverAll(world, ps);
  yard(world);
  ps.forEach((p, i) => {
    p.team = teams[i];
    place(p, xs[i]);
  });
  const m = newMole(700, FLOOR - tankH({ kind: TankKind.Mole, s: 0.8 }) - 2);
  world.tanks[0] = m;
  for (let k = 0; k < 15; k++) world.step();
  tapPickup(world, ps[0]);
  expect(ps[0].tank).toBe(0);
  return { world, ps, mole: world.tanks[0]! };
}

describe('the mole', () => {
  it('a smaller tank: four-fifths the size, 70% of the hull, a strong frill, three riders', () => {
    const m = newMole(0, 0);
    expect(isMole(m)).toBe(true);
    expect(tankW(m)).toBeLessThan(TANK_W);
    expect(m.hp).toBeCloseTo(TANK_HP * MOLE_HP);
    expect(m.partHp[TankPart.Armor]).toBe(MOLE_FRILL_HP);
    expect(surfCapacity(m)).toBe(3);
    // No cannon: the flamethrower in its place, and a heavier, faster SMG.
    expect(MOLE_SMG_INTERVAL).toBeLessThan(SMG_INTERVAL);
    expect(PROJ[ProjKind.MoleRound].damage).toBeGreaterThan(PROJ[ProjKind.TankBullet].damage);
  });

  it('is a radio call, parachuted onto the caller', () => {
    const world = new World(71);
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    yard(world);
    place(a, 1000);
    a.gold = MOLE_COST;
    world.equip(a, WeaponId.Radio);
    world.step();
    expect(world.call(a.id, CallKind.Mole)).toBe(true);
    expect(a.gold).toBe(0);
    expect(world.tanks.some((t) => t && isMole(t))).toBe(true);
  });

  it('its plasma burns through the ground: soil and concrete, fast', () => {
    for (const [mat, least] of [
      [Mat.Dirt, 600],
      [Mat.Concrete, 250],
    ] as const) {
      const { world, ps, mole } = setup(72, [Team.None], [690]);
      const wx = Math.round(mole.x + tankW(mole)) + 30;
      for (let x = wx; x < wx + 160; x++) for (let y = 200; y < FLOOR; y++) world.terrain.set(x, y, mat);
      world.terrainReplaced();
      const count = () => {
        let n = 0;
        for (let x = wx; x < wx + 160; x++) for (let y = 200; y < FLOOR; y++) if (world.terrain.get(x, y) === mat) n++;
        return n;
      };
      const before = count();
      for (let k = 0; k < 30 * 2; k++) {
        send(world, ps[0], BTN_SCOPE, 0.1);
        world.step();
      }
      expect(before - count()).toBeGreaterThan(least);
      expect(MOLE_PLASMA_INTERVAL).toBeLessThan(0.1);
    }
  });

  it('its plasma sears whoever is close, and falls short of whoever isn\'t', () => {
    const { world, ps, mole } = setup(73, [Team.Red, Team.Green, Team.Green], [690, 0, 0]);
    const [driver, near, far] = ps;
    const front = mole.x + tankW(mole);
    for (let k = 0; k < 30 * 2; k++) {
      place(near, front + 40);
      near.hp = Math.max(near.hp, 1);
      place(far, front + 260);
      // (Aimed down at it: the nozzle rides above a clone's head.)
      send(world, driver, BTN_SCOPE, Math.atan2(near.cy - (mole.y + 3), near.cx - (mole.x + 10)));
      world.step();
    }
    expect(near.hp < 100 || !near.alive).toBe(true);
    expect(far.hp).toBe(100);
  });

  it('its frill takes fire from the front meant for its riders; from behind, or once it\'s gone, they\'re open', () => {
    const { world, ps, mole } = setup(74, [Team.Red, Team.Red, Team.Green], [690, 684, 0]);
    const [, rider, enemy] = ps;
    tapPickup(world, rider);
    expect(rider.surf).toBe(0);
    rider.hp = 100;
    const frill = () => mole.partHp[TankPart.Armor];
    // (Hit anywhere: a wound on any part, a jetpack included.)
    const hurt = () => rider.hp < 100 || Array.from(rider.parts.wounds).some((w) => w > 0);
    const shoot = (fromRight: boolean, id: number) => {
      const y = rider.body.y + 5;
      const x = fromRight ? mole.x + tankW(mole) + 60 : mole.x - 60;
      world.projectiles.spawn(id, ProjKind.LightRound, enemy.id, x, y, fromRight ? -900 : 900, 0); // (through a vest)
      for (let k = 0; k < 6; k++) world.step();
    };
    // From the front (it faces right): the frill takes it.
    const f0 = frill();
    for (let n = 0; n < 5; n++) shoot(true, 92000 + n);
    expect(hurt()).toBe(false);
    expect(frill()).toBeLessThan(f0);
    // From behind: the rider is hit.
    shoot(false, 92100);
    expect(hurt()).toBe(true);
    // Shot away (it flies off), the front is open too.
    rider.hp = 100;
    resetBody(rider.parts, ClassId.Medium, 0);
    (world as unknown as { hurtTankPart(slot: number, part: number, dmg: number, by: number): void }).hurtTankPart(0, TankPart.Armor, MOLE_FRILL_HP + 1, enemy.id);
    expect(hasTankPart(mole.parts, TankPart.Armor)).toBe(false);
    shoot(true, 92200);
    expect(hurt()).toBe(true);
  });
});
