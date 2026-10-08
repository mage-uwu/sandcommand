import { describe, expect, it } from 'vitest';
import { ACTOR_H } from '../src/shared/constants.ts';
import { Reader } from '../src/shared/codec.ts';
import { SHIP_BOMBS, SHIP_H, SHIP_HP, SHIP_PART_CENTER, SHIP_W, ShipPart, hasShipPart, newShip, shipPoint } from '../src/shared/dropship.ts';
import { WEAPONS, WeaponId, ProjKind, PROJ } from '../src/shared/weapons.ts';
import { CALL_COST, CallKind } from '../src/shared/protocol.ts';
import { TANK_HP } from '../src/shared/tank.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

type Internals = {
  hurtShipPart: (slot: number, part: number, dmg: number, by: number) => void;
  placeClone: (p: Player, x: number, y: number, vx: number, vy: number) => void;
};
const internals = (w: World) => w as unknown as Internals;

/** A caller with a radio in hand and gold to spend, and an enemy standing in the open nearby. */
function setup(seed: number) {
  const world = new World(seed);
  const a = world.addPlayer('caller', { send() {} })!;
  const b = world.addPlayer('enemy', { send() {} })!;
  deliverAll(world, [a, b]);
  b.body.x = a.body.x + 90;
  b.body.y = world.terrain.surfaceY(Math.floor(b.body.x + 4)) - ACTOR_H;
  a.gold = CALL_COST + 500;
  world.equip(a, WeaponId.Radio);
  world.step();
  return { world, a, b };
}
const hold = (world: World, b: Player) => {
  // Keep the enemy standing there (no wandering off out of reach).
  b.body.vx = 0;
};

describe('radio and dropship', () => {
  it('every clone carries a radio', () => {
    const world = new World(61);
    const a = world.addPlayer('a', { send() {} })!;
    deliverAll(world, [a]);
    expect(a.inv.some((it) => it.weapon === WeaponId.Radio)).toBe(true);
    expect(a.inv.some((it) => it.weapon === WeaponId.Digger)).toBe(true);
    expect(WEAPONS[WeaponId.Radio].name).toBe('Radio');
  });

  it('calling costs gold, needs the radio in hand and the gold to pay, and recharges', () => {
    const { world, a } = setup(62);
    expect(world.call(a.id, CallKind.Dropship)).toBe(true);
    expect(a.gold).toBe(500);
    expect(world.ships.filter(Boolean).length).toBe(1);
    a.gold = CALL_COST * 3;
    expect(world.call(a.id, CallKind.Tank)).toBe(false); // radio recharging
    a.callCd = 0;
    world.equip(a, WeaponId.Digger);
    expect(world.call(a.id, CallKind.Tank)).toBe(false); // not in hand
    world.equip(a, WeaponId.Radio);
    a.gold = CALL_COST - 1;
    expect(world.call(a.id, CallKind.Tank)).toBe(false); // can't pay
  });

  it('a tank call parachutes an empty tank onto the caller', () => {
    const { world, a } = setup(63);
    const before = world.tanks.filter(Boolean).length;
    expect(world.call(a.id, CallKind.Tank)).toBe(true);
    const t = world.tanks.filter(Boolean)[before]!;
    expect(t.chute).toBe(true);
    expect(t.pilot).toBe(255);
    expect(Math.abs(t.x + 16 - a.cx)).toBeLessThan(40);
    for (let k = 0; k < 30 * 20 && !t.onGround; k++) world.step();
    expect(t.onGround).toBe(true);
    expect(Math.abs(t.x + 16 - a.cx)).toBeLessThan(60);
  });

  it('the dropship flies in, holds station, strafes and bombs an enemy near its caller', () => {
    const { world, a, b } = setup(64);
    world.call(a.id, CallKind.Dropship);
    const sh = world.ships.find(Boolean)!;
    let hit = false;
    let bombed = false;
    for (let k = 0; k < 30 * 12; k++) {
      hold(world, b);
      const hp = b.hp;
      world.step();
      if (b.hp < hp && !hit) {
        hit = true;
        // The turrets work; shoot them off (and patch the target up) so the bomb run gets its turn.
        const slot = world.ships.indexOf(sh);
        internals(world).hurtShipPart(slot, ShipPart.TurretL, 5000, b.id);
        internals(world).hurtShipPart(slot, ShipPart.TurretR, 5000, b.id);
        const x = a.body.x + 90;
        internals(world).placeClone(b, x, world.terrain.surfaceY(Math.floor(x + 4)) - ACTOR_H, 0, 0);
      }
      if (sh.bombs < SHIP_BOMBS) bombed = true;
      if (!b.alive) break;
    }
    expect(hit).toBe(true);
    expect(bombed).toBe(true);
    expect(b.alive).toBe(false);
    // Hovering over the caller afterwards, level, at altitude.
    for (let k = 0; k < 30 * 6; k++) world.step();
    if (world.ships[world.ships.indexOf(sh)] === sh) {
      expect(Math.abs(sh.x + SHIP_W / 2 - a.cx)).toBeLessThan(30);
      expect(Math.abs(sh.a)).toBeLessThan(0.1);
      expect(a.cy - (sh.y + SHIP_H / 2)).toBeGreaterThan(40);
    }
  });

  it('carries 8 bombs of 5x a bazooka blast, and never hits its caller or itself', () => {
    expect(SHIP_BOMBS).toBe(8);
    expect(PROJ[ProjKind.Bomb].splashDamage).toBe(5 * PROJ[ProjKind.Rocket].splashDamage);
    const { world, a } = setup(65);
    world.call(a.id, CallKind.Dropship);
    const sh = world.ships.find(Boolean)!;
    for (let k = 0; k < 30 * 8; k++) world.step();
    const hp0 = sh.hp;
    // The caller fires up at it: friendly.
    world.projectiles.spawn(9100, ProjKind.Rocket, a.id, sh.x + SHIP_W / 2, sh.y + SHIP_H + 20, 0, -380);
    for (let k = 0; k < 10; k++) world.step();
    expect(sh.hp).toBe(hp0);
    expect(a.alive).toBe(true);
  });

  it('half a tank tough; turrets, engines, doors and hull all come apart', () => {
    expect(SHIP_HP * 2).toBe(TANK_HP);
    const { world, a, b } = setup(66);
    world.call(a.id, CallKind.Dropship);
    const slot = world.ships.findIndex(Boolean);
    const sh = world.ships[slot]!;
    for (let k = 0; k < 30 * 8; k++) world.step();
    for (const part of [ShipPart.TurretL, ShipPart.Doors, ShipPart.EngineA]) {
      internals(world).hurtShipPart(slot, part, 5000, b.id);
      expect(hasShipPart(sh.parts, part)).toBe(false);
    }
    // No doors, no bombs.
    const bombs = sh.bombs;
    for (let k = 0; k < 30 * 5; k++) world.step();
    expect(sh.bombs).toBe(bombs);
    // Three engines still keep it up; losing the other side's too brings it down.
    expect(world.ships[slot]).toBe(sh);
    internals(world).hurtShipPart(slot, ShipPart.EngineB, 5000, b.id);
    internals(world).hurtShipPart(slot, ShipPart.EngineC, 5000, b.id);
    for (let k = 0; k < 30 * 15 && world.ships[slot] === sh; k++) world.step();
    expect(world.ships[slot]).toBeNull(); // crashed and blew up
    // The hull going is the end too.
    const s2 = newShip(1000, 100, a.id, a.team);
    world.ships[slot] = s2;
    internals(world).hurtShipPart(slot, ShipPart.Hull, SHIP_HP + 1, b.id);
    expect(world.ships[slot]).toBeNull();
    void SHIP_PART_CENTER;
    void shipPoint;
  });

  it('clients see the dropship: where, tilt, parts, bombs, guns', () => {
    const frames: Uint8Array[] = [];
    const world = new World(67);
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    deliverAll(world, [a]);
    a.gold = CALL_COST;
    world.equip(a, WeaponId.Radio);
    world.step();
    world.call(a.id, CallKind.Dropship);
    for (let k = 0; k < 60; k++) world.step();
    const game = new Game();
    game.myId = a.id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    const views = game.shipViews();
    expect(views.length).toBe(1);
    expect(views[0].owner).toBe(a.id);
    expect(views[0].bombs).toBe(SHIP_BOMBS);
    expect(views[0].parts).toBe(255);
  });
});
