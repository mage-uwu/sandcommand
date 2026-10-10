import { describe, expect, it } from 'vitest';
import { BTN_UP } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { SHIP_RIDERS, newShip, shipSeat } from '../src/shared/dropship.ts';
import { invByte } from '../src/shared/items.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { type Player, World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

type Internals = { hurtShipPart: (slot: number, part: number, dmg: number, by: number) => void };

let seq = 0;
const send = (w: World, p: Player, buttons: number, pickup = false) => w.input(p.id, { seq: ++seq & 0xffff, buttons, aim: quantizeAim(0), inv: invByte(p.slot, p.invVersion, pickup) });
const tap = (w: World, p: Player) => {
  send(w, p, 0, true);
  w.step();
  send(w, p, 0, false);
  w.step();
};

/** Four teammates and a dropship of theirs hovering low; each placed by a roof seat as it comes. */
function setup(links: { send(d: Uint8Array): void }[] = []) {
  const world = new World(77);
  const ps = [0, 1, 2, 3, 4].map((i) => world.addPlayer(`p${i}`, links[i] ?? { send() {} })!);
  deliverAll(world, ps);
  ps.forEach((p, i) => (p.team = i < 4 ? Team.Red : Team.Green));
  // (The empty drop rockets climb away first: one going up through the roof would crush its riders.)
  for (let k = 0; k < 30 * 30 && world.crafts.some((c) => c !== null); k++) world.step();
  const x = ps[0].body.x;
  const sh = newShip(x - 40, world.terrain.surfaceY(Math.floor(x)) - 110, ps[0].id, Team.Red);
  world.ships[0] = sh;
  const toRoof = (p: Player, i: number) => {
    const s = shipSeat(sh, i, { x: 0, y: 0 });
    p.body.x = s.x - ACTOR_W / 2;
    p.body.y = s.y - ACTOR_H - 2;
    p.body.vx = p.body.vy = 0;
  };
  return { world, ps, sh, toRoof };
}

describe('dropship surfing', () => {
  it('three ride on its roof, its side only; a fourth finds no seat', () => {
    const { world, ps, toRoof } = setup();
    for (let i = 0; i < 4; i++) {
      toRoof(ps[i], Math.min(i, SHIP_RIDERS - 1));
      tap(world, ps[i]);
    }
    const riders = ps.filter((p) => p.surfShip === 0);
    expect(riders.length).toBe(3);
    expect(new Set(riders.map((p) => p.seat)).size).toBe(3);
    // The enemy can't get on, even with a seat free.
    riders[2].surfShip = -1;
    toRoof(ps[4], riders[2].seat);
    tap(world, ps[4]);
    expect(ps[4].surfShip).toBe(-1);
  });

  it('riders go where it flies, on their seats; jump off; thrown off when it blows up', () => {
    const { world, ps, sh, toRoof } = setup();
    toRoof(ps[1], 0);
    tap(world, ps[1]);
    expect(ps[1].surfShip).toBe(0);
    const x0 = sh.x;
    for (let k = 0; k < 90; k++) {
      send(world, ps[1], 0);
      world.step();
      const s = shipSeat(sh, ps[1].seat, { x: 0, y: 0 });
      expect(Math.abs(ps[1].cx - s.x)).toBeLessThan(0.01);
      expect(Math.abs(ps[1].body.y + ACTOR_H - s.y)).toBeLessThan(0.01);
    }
    expect(Math.abs(sh.x - x0) + 1).toBeGreaterThan(0); // (it flew its mission; the rider stayed put on it)
    send(world, ps[1], BTN_UP);
    world.step();
    expect(ps[1].surfShip).toBe(-1);
    // Back on, then it's shot down: thrown clear.
    toRoof(ps[1], 1);
    tap(world, ps[1]);
    expect(ps[1].surfShip).toBe(0);
    (world as unknown as Internals).hurtShipPart(0, 0, 1e9, ps[4].id);
    world.step();
    expect(world.ships[0]).toBeNull();
    expect(ps[1].surfShip).toBe(-1);
  });

  it('every client draws its riders on the roof as it draws the ship', () => {
    const inbox: Uint8Array[] = [];
    const inbox2: Uint8Array[] = [];
    const { world, ps, toRoof } = setup([{ send: (d) => inbox.push(d) }, { send() {} }, { send: (d) => inbox2.push(d) }]);
    const game = new Game();
    game.myId = ps[0].id;
    const rider = new Game();
    rider.myId = ps[2].id;
    toRoof(ps[2], 2);
    tap(world, ps[2]);
    expect(ps[2].surfShip).toBe(0);
    for (let k = 0; k < 30; k++) {
      world.step();
      for (const f of inbox.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const t = r.u32();
        const ack = r.u16();
        game.applyFrame(t, ack, r);
      }
      for (const f of inbox2.splice(0)) {
        const r = new Reader(f);
        r.u8();
        const t = r.u32();
        const ack = r.u16();
        rider.applyFrame(t, ack, r);
      }
    }
    // The rider's own client knows it's on the roof, and where.
    expect(rider.surfShip).toBe(0);
    expect(rider.surf).toBe(-1);
    expect(rider.surfSeatNo).toBe(2);
    expect(rider.ridingAt()).not.toBeNull();
    const sv = game.shipViews().find((v) => v.slot === 0)!;
    expect(sv.riders.map((r) => r & 255)).toEqual([ps[2].id]);
    const seen = game.remoteViews().find((v) => v.id === ps[2].id)!;
    const s = shipSeat(game.shipViews().find((v) => v.slot === 0)!, 2, { x: 0, y: 0 });
    expect(seen.x).toBeCloseTo(s.x - ACTOR_W / 2, 0);
    expect(seen.y).toBeCloseTo(s.y - ACTOR_H, 0);
    expect(seen.moving).toBe(false);
  });
});
