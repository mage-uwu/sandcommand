import { describe, expect, it } from 'vitest';
import { ACTOR_H } from '../src/shared/constants.ts';
import { Reader } from '../src/shared/codec.ts';
import { ENGINE_NOZZLE_Y, ENGINE_X, HULL_W, HULL_X, SHIP_BOMBS, SHIP_H, SHIP_HP, SHIP_PART_CENTER, SHIP_W, ShipMission, ShipPart, hasShipPart, newShip, shipPoint } from '../src/shared/dropship.ts';
import { WEAPONS, WeaponId, ProjKind, PROJ } from '../src/shared/weapons.ts';
import { CALL_COST, CallKind, Team } from '../src/shared/protocol.ts';
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
    // Afterwards it's off on its own (scouting or after the next target), but on its leash, flying level, up high.
    for (let k = 0; k < 30 * 6; k++) world.step();
    if (world.ships[world.ships.indexOf(sh)] === sh) {
      expect(Math.abs(sh.x + SHIP_W / 2 - a.cx)).toBeLessThan(800);
      expect(Math.abs(sh.a)).toBeLessThan(0.45);
      expect(world.terrain.surfaceY(Math.floor(sh.x + SHIP_W / 2)) - (sh.y + SHIP_H)).toBeGreaterThan(20);
    }
  });

  it('with nobody about, it scouts out ahead of its caller, toward the enemy', () => {
    const { world, a, b } = setup(70);
    // The enemy far off to the east, beyond striking reach.
    const x = Math.min(a.body.x + 1500, 3900);
    internals(world).placeClone(b, x, world.terrain.surfaceY(Math.floor(x + 4)) - ACTOR_H, 0, 0);
    world.call(a.id, CallKind.Dropship);
    const sh = world.ships.find(Boolean)!;
    let ahead = 0;
    for (let k = 0; k < 30 * 14; k++) {
      a.body.vx = 0;
      hold(world, b);
      world.step();
      if (world.ships.indexOf(sh) < 0) break;
      if (sh.mission === ShipMission.Scout) ahead = Math.max(ahead, sh.x + SHIP_W / 2 - a.cx);
    }
    expect(world.ships.indexOf(sh)).toBeGreaterThanOrEqual(0);
    expect(ahead).toBeGreaterThan(250); // out east, the enemy's way
    expect(ahead).toBeLessThan(800); // on its leash
  });

  it('in a team mode it covers any teammate under fire, not just its caller', () => {
    const world = new World(71);
    const a = world.addPlayer('caller', { send() {} })!;
    const c = world.addPlayer('mate', { send() {} })!;
    const b = world.addPlayer('enemy', { send() {} })!;
    deliverAll(world, [a, b, c]);
    a.team = c.team = Team.Red;
    b.team = Team.Green;
    // The teammate 500 cells off with an enemy right on them; the caller alone.
    const cx = a.body.x + 500;
    internals(world).placeClone(c, cx, world.terrain.surfaceY(Math.floor(cx + 4)) - ACTOR_H, 0, 0);
    internals(world).placeClone(b, cx + 60, world.terrain.surfaceY(Math.floor(cx + 64)) - ACTOR_H, 0, 0);
    a.gold = CALL_COST;
    world.equip(a, WeaponId.Radio);
    world.step();
    expect(world.call(a.id, CallKind.Dropship)).toBe(true);
    const sh = world.ships.find(Boolean)!;
    let covered = false;
    let closest = Infinity;
    for (let k = 0; k < 30 * 12 && b.alive; k++) {
      a.body.vx = c.body.vx = b.body.vx = 0;
      c.hp = 100; // (the teammate holds out)
      world.step();
      if (sh.mission === ShipMission.Cover && sh.focus === b.id) covered = true;
      closest = Math.min(closest, Math.abs(sh.x + SHIP_W / 2 - b.cx));
    }
    expect(covered).toBe(true);
    expect(closest).toBeLessThan(80);
  });

  it("it spots enemies for its side: they're marked on the caller's screen", () => {
    const frames: Uint8Array[] = [];
    const world = new World(72);
    const a = world.addPlayer('a', { send: (d) => frames.push(d) })!;
    const b = world.addPlayer('b', { send() {} })!;
    deliverAll(world, [a, b]);
    const x = a.body.x + 200;
    internals(world).placeClone(b, x, world.terrain.surfaceY(Math.floor(x + 4)) - ACTOR_H, 0, 0);
    a.gold = CALL_COST;
    world.equip(a, WeaponId.Radio);
    world.step();
    world.call(a.id, CallKind.Dropship);
    frames.length = 0;
    for (let k = 0; k < 30 * 6; k++) {
      b.body.vx = 0;
      world.step();
    }
    expect(world.spots.get(a.id)?.has(b.id)).toBe(true);
    const game = new Game();
    game.myId = a.id;
    for (const f of frames) {
      const r = new Reader(f);
      r.u8();
      const tick = r.u32();
      const ack = r.u16();
      game.applyFrame(tick, ack, r);
    }
    const seen = game.spottedNow();
    expect(seen.map((e) => e.id)).toContain(b.id);
    expect(Math.abs(seen[0].x - b.cx)).toBeLessThan(40);
    expect(game.feed.some((f) => f.text.includes('dropship: contact'))).toBe(true);
    expect(game.shipViews()[0].mission).toBeGreaterThanOrEqual(0);
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

  it('an engine shot off keeps burning: it spins out and blows up on whatever it hits', () => {
    const { world, a, b } = setup(68);
    world.call(a.id, CallKind.Dropship);
    const slot = world.ships.findIndex(Boolean);
    for (let k = 0; k < 30 * 8; k++) world.step();
    const pr = world.projectiles;
    internals(world).hurtShipPart(slot, ShipPart.EngineD, 5000, b.id);
    const i = Array.from(pr.kind.subarray(0, pr.n)).indexOf(ProjKind.Engine);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(pr.owner[i]).toBe(b.id); // whoever shot it loose
    const id = pr.id[i];
    const speeds: number[] = [];
    const angs: number[] = [];
    for (let k = 0; k < PROJ[ProjKind.Engine].life + 2; k++) {
      const j = pr.indexOf(id);
      if (j < 0) break;
      speeds.push(Math.hypot(pr.vx[j], pr.vy[j]));
      angs.push(pr.ang[j]);
      world.step();
    }
    expect(pr.indexOf(id)).toBe(-1); // it came down and went off
    expect(speeds.length).toBeGreaterThan(5);
    // Under its own power for a while, spinning faster and faster.
    expect(Math.max(...speeds.slice(0, 20))).toBeGreaterThan(speeds[0] + 40);
    const turn = (k: number) => Math.abs(angs[k + 1] - angs[k]);
    if (angs.length > 40) expect(turn(35)).toBeGreaterThan(turn(1));

    // Straight into a clone: it goes off like a big rocket.
    const c = world.addPlayer('target', { send() {} })!;
    deliverAll(world, [c]);
    const hp = c.hp;
    world.projectiles.spawn(9200, ProjKind.Engine, b.id, c.cx - 14, c.cy, 320, 0);
    for (let k = 0; k < 6; k++) world.step();
    expect(world.projectiles.indexOf(9200)).toBe(-1);
    expect(!c.alive || c.hp < hp).toBe(true);
  });

  it('the rocket pods hang out past the hull: open to fire from below', () => {
    for (const ex of ENGINE_X) expect(ex < HULL_X || ex > HULL_X + HULL_W).toBe(true);
    const { world, a, b } = setup(69);
    world.call(a.id, CallKind.Dropship);
    const sh = world.ships.find(Boolean)!;
    for (let k = 0; k < 30 * 8; k++) world.step();
    // A rifle round straight up the ship's own vertical, under the port outer pod.
    const from = shipPoint(sh, ENGINE_X[0], SHIP_H + 12, { x: 0, y: 0 });
    const to = shipPoint(sh, ENGINE_X[0], -10, { x: 0, y: 0 });
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const pod = sh.partHp[ShipPart.EngineA];
    world.projectiles.spawn(9300, ProjKind.Bullet, b.id, from.x, from.y, ((to.x - from.x) / d) * 900 + sh.vx, ((to.y - from.y) / d) * 900 + sh.vy);
    world.step();
    world.step();
    expect(sh.partHp[ShipPart.EngineA]).toBeLessThan(pod);
    // Beside the hull, under the pylons, is open air: nothing to hit.
    const hp = sh.hp;
    const f2 = shipPoint(sh, HULL_X - 4, SHIP_H + 12, { x: 0, y: 0 });
    const t2 = shipPoint(sh, HULL_X - 4, ENGINE_NOZZLE_Y + 3, { x: 0, y: 0 });
    const d2 = Math.hypot(t2.x - f2.x, t2.y - f2.y);
    world.projectiles.spawn(9301, ProjKind.Bullet, b.id, f2.x, f2.y, ((t2.x - f2.x) / d2) * 300 + sh.vx, ((t2.y - f2.y) / d2) * 300 + sh.vy);
    world.step();
    world.step();
    expect(sh.hp).toBe(hp);
    void a;
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
