import { describe, expect, it } from 'vitest';
import { BTN_FIRE, BTN_RIGHT, BTN_SCOPE, BTN_UP } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_MAX_HP } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { Phase, quantizeAim } from '../src/shared/protocol.ts';
import { TANK_H, TANK_HP, TANK_PART_CENTER, TANK_W, TankPart, hasTankPart, newTank } from '../src/shared/tank.ts';
import { ProjKind } from '../src/shared/weapons.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/** A flat bedrock yard, x 600..1600, open sky above the floor. */
function yard(world: World): void {
  const t = world.terrain;
  for (let x = 600; x < 1600; x++) {
    for (let y = 60; y < FLOOR; y++) t.set(x, y, Mat.Air);
    for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
  }
  world.terrainReplaced();
}

type Internals = {
  hurtTankPart: (slot: number, part: number, dmg: number, by: number) => void;
  splashTanks: (x: number, y: number, r: number, dmg: number, owner: number) => void;
  hitTank: (slot: number, wx: number, wy: number, dx: number, dy: number, energy: number, wound: number, by: number) => void;
};
const internals = (w: World) => w as unknown as Internals;

let seq = 0;
function send(world: World, p: Player, buttons: number, pickup = false, aim = 0): void {
  world.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(aim), inv: invByte(p.slot, p.invVersion, pickup) });
}
/** Tap the pick-up key (a press edge). */
function tapPickup(world: World, p: Player): void {
  send(world, p, 0, true);
  world.step();
  send(world, p, 0, false);
  world.step();
}

function setup(seed: number) {
  const world = new World(seed);
  const a = world.addPlayer('driver', { send() {} })!;
  const b = world.addPlayer('other', { send() {} })!;
  deliverAll(world, [a, b]);
  yard(world);
  for (const [p, x] of [
    [a, 700],
    [b, 1400],
  ] as const) {
    p.body.x = x;
    p.body.y = FLOOR - ACTOR_H;
    p.body.vx = p.body.vy = 0;
  }
  // A landed tank next to the driver.
  world.tanks[0] = newTank(714, FLOOR - TANK_H - 2);
  for (let k = 0; k < 10; k++) world.step();
  return { world, a, b, tank: world.tanks[0]! };
}

describe('tanks', () => {
  it('come down under a parachute, gently, and lose it on touchdown', () => {
    const world = new World(31);
    yard(world);
    world.tanks[0] = newTank(1000, 0);
    const t = world.tanks[0]!;
    let maxFall = 0;
    for (let k = 0; k < 600 && t.chute; k++) {
      world.step();
      maxFall = Math.max(maxFall, t.vy);
    }
    expect(t.chute).toBe(false);
    expect(t.onGround).toBe(true);
    expect(maxFall).toBeLessThanOrEqual(50);
    expect(t.y + TANK_H).toBeCloseTo(FLOOR, 0);
  });

  it('a round drops one or two of them each wave', () => {
    const world = new World(32, { mode: 'ffa' });
    world.addPlayer('a', { send() {} });
    world.addPlayer('b', { send() {} });
    for (let k = 0; k < 400 && world.phase !== Phase.Live; k++) world.step();
    const n = world.tanks.filter(Boolean).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(2);
    expect(world.tanks.every((t) => !t || t.chute)).toBe(true);
  });

  it('you climb into an empty tank with the pick-up key, drive it, and climb back out', () => {
    const { world, a, tank } = setup(33);
    tapPickup(world, a);
    expect(a.tank).toBe(0);
    expect(tank.pilot).toBe(a.id);
    const x0 = tank.x;
    for (let k = 0; k < 30; k++) {
      send(world, a, BTN_RIGHT);
      world.step();
    }
    expect(tank.x - x0).toBeGreaterThan(30);
    // The driver rides inside.
    expect(a.body.x).toBeGreaterThan(tank.x);
    expect(a.body.x).toBeLessThan(tank.x + TANK_W);
    tapPickup(world, a);
    expect(a.tank).toBe(-1);
    expect(tank.pilot).toBe(255);
    expect(a.body.y + ACTOR_H).toBeLessThanOrEqual(tank.y + 1); // out of the roof hatch
  });

  it('jets lift it off the ground and burn fuel', () => {
    const { world, a, tank } = setup(34);
    tapPickup(world, a);
    const y0 = tank.y;
    for (let k = 0; k < 20; k++) {
      send(world, a, BTN_UP);
      world.step();
    }
    expect(y0 - tank.y).toBeGreaterThan(10);
    expect(tank.fuel).toBeLessThan(100);
  });

  it('fires its vulcan and its cannon, and its own rounds never hit it', () => {
    const { world, a, tank } = setup(35);
    tapPickup(world, a);
    const pr = world.projectiles;
    const kinds = () => Array.from({ length: pr.n }, (_, i) => pr.kind[i]);
    send(world, a, BTN_FIRE, false, 0);
    world.step();
    expect(kinds()).toContain(ProjKind.TankBullet);
    send(world, a, BTN_SCOPE, false, -0.3);
    world.step();
    expect(kinds()).toContain(ProjKind.Shell);
    // Fire backwards through its own hull: nothing hurts it.
    for (let k = 0; k < 30; k++) {
      send(world, a, BTN_FIRE, false, Math.PI);
      world.step();
    }
    expect(tank.hp).toBe(TANK_HP);
  });

  it('has fifteen clones of durability: rifle fire chips at it, it does not die to a magazine', () => {
    const { world, b, tank } = setup(36);
    expect(TANK_HP).toBe(15 * ACTOR_MAX_HP);
    // Thirty rifle rounds into the hull side (below the armour, away from the guns).
    for (let k = 0; k < 30; k++) internals(world).hitTank(0, tank.x + 2, tank.y + 14, 1, 0, 400, 16, b.id);
    expect(world.tanks[0]).toBe(tank);
    expect(tank.hp).toBeLessThan(TANK_HP);
    expect(tank.hp).toBeGreaterThan(TANK_HP * 0.6);
  });

  it('the cannon, the SMG and the armour plate can each be blown off', () => {
    const { world, a, b, tank } = setup(37);
    tapPickup(world, a);
    tank.faceLeft = false;
    const at = (part: number) => [tank.x + TANK_PART_CENTER[part][0], tank.y + TANK_PART_CENTER[part][1]] as const;
    // The cannon: shoot at the turret front until it goes.
    for (let k = 0; k < 40 && hasTankPart(tank.parts, TankPart.Cannon); k++) {
      const [x, y] = at(TankPart.Cannon);
      internals(world).hitTank(0, x - 2, y, 1, 0, 400, 38, b.id);
    }
    expect(hasTankPart(tank.parts, TankPart.Cannon)).toBe(false);
    // No cannon, no shells.
    world.projectiles.n = 0;
    send(world, a, BTN_SCOPE, false, 0);
    world.step();
    expect(Array.from({ length: world.projectiles.n }, (_, i) => world.projectiles.kind[i])).not.toContain(ProjKind.Shell);
    for (let k = 0; k < 40 && hasTankPart(tank.parts, TankPart.Smg); k++) {
      const [x, y] = at(TankPart.Smg);
      internals(world).hitTank(0, x - 2, y, 1, 0, 400, 38, b.id);
    }
    expect(hasTankPart(tank.parts, TankPart.Smg)).toBe(false);
    // The plate soaks blasts until it is blown away.
    for (let k = 0; k < 20 && hasTankPart(tank.parts, TankPart.Armor); k++) internals(world).splashTanks(tank.x + TANK_W + 6, tank.y + 8, 40, 90, b.id);
    expect(hasTankPart(tank.parts, TankPart.Armor)).toBe(false);
    expect(world.tanks[0]).toBe(tank); // still running on its hull
  });

  it('when the hull goes it explodes and kills its driver, credited to whoever did it', () => {
    const { world, a, b, tank } = setup(38);
    tapPickup(world, a);
    internals(world).hurtTankPart(0, TankPart.Hull, TANK_HP + 1, b.id);
    expect(world.tanks[0]).toBeNull();
    expect(a.alive).toBe(false);
    expect(a.tank).toBe(-1);
    expect(b.kills).toBe(1);
    void tank;
  });

  it('the driver is safe inside: blasts and bullets hit the tank, not the clone', () => {
    const { world, a, b, tank } = setup(39);
    tapPickup(world, a);
    const hp0 = a.hp;
    world.projectiles.spawn(7777, ProjKind.Rocket, b.id, tank.x + TANK_W / 2, tank.y - 20, 0, 380);
    for (let k = 0; k < 10; k++) world.step();
    expect(a.hp).toBe(hp0);
    expect(tank.hp).toBeLessThan(TANK_HP);
  });

  it("the driver's client predicts its tank and agrees with the server", () => {
    const frames: Uint8Array[] = [];
    const world = new World(40);
    const a = world.addPlayer('driver', { send: (d) => frames.push(d) })!;
    deliverAll(world, [a]);
    yard(world);
    a.body.x = 700;
    a.body.y = FLOOR - ACTOR_H;
    world.tanks[0] = newTank(714, FLOOR - TANK_H - 2);
    const game = new Game();
    game.myId = a.id;
    const pump = () => {
      for (const f of frames) {
        const r = new Reader(f);
        r.u8();
        const tick = r.u32();
        const ack = r.u16();
        game.applyFrame(tick, ack, r);
      }
      frames.length = 0;
    };
    for (let k = 0; k < 10; k++) world.step();
    pump();
    expect(game.tankPilots.size).toBe(0);
    // Board, then drive right on the client exactly as the main loop does.
    const tick = (buttons: number, pickup = false) => {
      if (pickup) game.pickUp();
      const inv = game.invByte();
      game.localTick(buttons, quantizeAim(0), (s) => world.input(a.id, { seq: s, buttons, aim: quantizeAim(0), inv }));
      world.step();
      pump();
    };
    tick(0, true);
    tick(0);
    expect(game.drive).not.toBeNull();
    expect(game.tankPilots.has(a.id)).toBe(true);
    for (let k = 0; k < 40; k++) tick(k < 20 ? BTN_RIGHT : BTN_UP);
    const t = world.tanks[0]!;
    expect(game.drive!.x).toBeCloseTo(t.x, 3);
    expect(game.drive!.y).toBeCloseTo(t.y, 3);
    expect(game.tankCorrections).toBe(0);
    tick(0, true);
    tick(0);
    expect(game.drive).toBeNull();
  });
});
