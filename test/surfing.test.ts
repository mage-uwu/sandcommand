import { describe, expect, it } from 'vitest';
import { BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { ACTOR_H } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { TANK_H, newTank, newTarantula, surfCapacity, tankH } from '../src/shared/tank.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { BotBrain } from '../src/server/bots.ts';
import { type Player, World } from '../src/server/world.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

function yard(world: World): void {
  const t = world.terrain;
  for (let x = 300; x < 2400; x++) {
    for (let y = 60; y < FLOOR; y++) t.set(x, y, Mat.Air);
    for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
}

let seq = 0;
function send(world: World, p: Player, buttons: number, pickup = false): void {
  world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(0), inv: invByte(p.slot, p.invVersion, pickup) });
}
function tapPickup(world: World, p: Player): void {
  send(world, p, 0, true);
  world.step();
  send(world, p, 0, false);
  world.step();
}

/** A yard, a tank driven by `driver`, and soldiers standing beside it; teams as given. */
function setup(n: number, teams: number[]) {
  const world = new World(55);
  const ps: Player[] = [];
  for (let i = 0; i < n; i++) ps.push(world.addPlayer(`p${i}`, { send() {} })!);
  deliverAll(world, ps);
  yard(world);
  ps.forEach((p, i) => {
    p.team = teams[i];
    p.body.x = 690 - i * 3;
    p.body.y = FLOOR - ACTOR_H;
    p.body.vx = p.body.vy = 0;
  });
  world.tanks[0] = newTank(700, FLOOR - TANK_H - 2);
  for (let k = 0; k < 10; k++) world.step();
  // The first climbs in and drives.
  tapPickup(world, ps[0]);
  expect(ps[0].tank).toBe(0);
  return { world, ps, tank: world.tanks[0]! };
}

describe('tank surfing', () => {
  it('teammates ride on top of a teammate\'s tank (three seats); an enemy can\'t', () => {
    const { world, ps } = setup(6, [Team.Red, Team.Red, Team.Red, Team.Red, Team.Red, Team.Green]);
    for (const p of ps.slice(1)) tapPickup(world, p);
    const riders = ps.slice(1, 5).filter((p) => p.surf === 0);
    expect(riders.length).toBe(3); // full
    expect(new Set(riders.map((p) => p.seat)).size).toBe(3);
    expect(ps[5].surf).toBe(-1); // the enemy stays on the ground
  });

  it('riders ride along on its deck, and jump off', () => {
    const { world, ps, tank } = setup(2, [Team.Red, Team.Red]);
    const [driver, rider] = ps;
    tapPickup(world, rider);
    expect(rider.surf).toBe(0);
    const x0 = rider.body.x;
    for (let k = 0; k < 60; k++) {
      send(world, driver, BTN_RIGHT);
      send(world, rider, 0);
      world.step();
    }
    expect(rider.body.x - x0).toBeGreaterThan(60);
    // Standing on the deck, not in the tank.
    expect(rider.body.y + ACTOR_H).toBeLessThan(tank.y + 4);
    expect(Math.abs(rider.cx - (tank.x + 16))).toBeLessThan(24);
    send(world, rider, BTN_UP);
    world.step();
    expect(rider.surf).toBe(-1);
    expect(rider.body.vy).toBeLessThan(0);
  });

  it('the driver\'s guns fire over its riders; the riders\' shots pass over the tank', () => {
    const { world, ps, tank } = setup(3, [Team.Red, Team.Red, Team.Green]);
    const [driver, rider, enemy] = ps;
    tapPickup(world, rider);
    rider.hp = 100;
    const hull = tank.hp;
    // A round of the driver's, straight through where the rider stands.
    world.projectiles.spawn(99001, ProjKind.TankBullet, driver.id, rider.body.x - 20, rider.body.y + 7, 900, 0);
    // A round of the rider's, straight down through the hull.
    world.projectiles.spawn(99002, ProjKind.Bullet, rider.id, tank.x + 16, tank.y - 4, 0, 900);
    for (let k = 0; k < 6; k++) world.step();
    expect(rider.hp).toBe(100);
    expect(tank.hp).toBe(hull);
    void enemy;
  });

  it('in a free-for-all, only your own watchdog or tarantula (five seats on a tarantula)', () => {
    const world = new World(56);
    const a = world.addPlayer('a', { send() {} })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    yard(world);
    const sp = newTarantula(700, FLOOR - tankH({ kind: 2, s: 3 }) - 1, a.id);
    world.tanks[1] = sp;
    for (const p of [a, b]) {
      p.body.x = 690;
      p.body.y = FLOOR - ACTOR_H;
    }
    for (let k = 0; k < 20; k++) world.step();
    expect(surfCapacity(sp)).toBe(5);
    tapPickup(world, b);
    expect(b.surf).toBe(-1); // not b's
    tapPickup(world, a);
    expect(a.surf).toBe(1);
    // Destroyed under its rider: thrown clear, alive.
    (world as unknown as { destroyTank(slot: number, by: number): void }).destroyTank(1, 255);
    world.step();
    expect(a.surf).toBe(-1);
  });

  it('a bot hops on a teammate\'s tank heading for a fight that\'s still a way off', () => {
    const { world, ps } = setup(3, [Team.Red, Team.Red, Team.Green]);
    const [driver, bot, enemy] = ps;
    enemy.body.x = 2200;
    const brain = new BotBrain(9);
    let rode = false;
    for (let k = 0; k < 30 * 6 && !rode; k++) {
      send(world, driver, BTN_RIGHT);
      world.input(bot.id, brain.think(world, bot));
      enemy.body.x = 2200;
      world.step();
      if (bot.surf === 0) rode = true;
    }
    expect(rode).toBe(true);
  });
});

describe('the death banner', () => {
  it('says what killed you: who and with what, or what happened', async () => {
    const { causeOfDeath } = await import('../src/client/game.ts');
    const { W_DEBRIS, W_ROCKFALL } = await import('../src/shared/particles.ts');
    expect(causeOfDeath('Rex', 3, 1, ProjKind.Slug, 'Sniper')).toBe('killed by Rex [Sniper]');
    expect(causeOfDeath('', 255, 1, W_DEBRIS, 'Debris')).toBe('buried in a cave-in');
    expect(causeOfDeath('Rex', 3, 1, W_ROCKFALL, 'Falling Rock')).toBe('crushed by falling rock [Rex brought it down]');
    expect(causeOfDeath('Me', 1, 1, 255, 'fell')).toBe('fell to your death');
    expect(causeOfDeath('Me', 1, 1, ProjKind.Rocket, 'Bazooka')).toBe('killed yourself');
    // (No " · " in it: the banner splits its lines on those.)
    expect(causeOfDeath('Rex', 3, 1, ProjKind.Rocket, 'Bazooka')).not.toContain(' · ');
  });
});
