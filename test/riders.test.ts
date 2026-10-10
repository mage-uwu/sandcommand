import { describe, expect, it, vi } from 'vitest';
import { BTN_RIGHT } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { ACTOR_H, ACTOR_W } from '../src/shared/constants.ts';
import { invByte } from '../src/shared/items.ts';
import { Mat } from '../src/shared/materials.ts';
import { Team, quantizeAim } from '../src/shared/protocol.ts';
import { TankKind, newMole, surfSeat, tankH } from '../src/shared/tank.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';
import { deliverAll } from './helpers.ts';

const FLOOR = 400;

/**
 * Riders on top of a vehicle are drawn on their seats on it, wherever each
 * client draws the vehicle: the driver's predicted one (ahead of the riders'
 * own snapshots), or everyone else's interpolated one. Drawn from their own
 * snapshots instead, they slid and stuttered about the deck.
 */
describe('riders on a vehicle', () => {
  it('every client draws them on their seats on the vehicle as it draws it, the mole\'s on its hull', () => {
    const world = new World(71);
    const inbox: Uint8Array[][] = [[], []];
    const ps = [0, 1].map((i) => world.addPlayer(`p${i}`, { send: (d) => inbox[i].push(d) })!);
    deliverAll(world, ps);
    const t = world.terrain;
    for (let x = 200; x < 2600; x++) {
      for (let y = 40; y < FLOOR; y++) t.set(x, y, Mat.Air);
      for (let y = FLOOR; y < FLOOR + 20; y++) t.set(x, y, Mat.Bedrock);
    }
    world.terrainReplaced();
    ps.forEach((p, i) => {
      p.team = Team.Red;
      p.body.x = 690 - i * 3;
      p.body.y = FLOOR - ACTOR_H;
      p.body.vx = p.body.vy = 0;
    });
    world.tanks[0] = newMole(700, FLOOR - tankH({ kind: TankKind.Mole, s: 0.8 }) - 2);
    const games = ps.map((p) => {
      const g = new Game();
      g.myId = p.id;
      return g;
    });
    let pick = [false, false];
    const tick = (buttons: number[]) => {
      ps.forEach((p, i) => {
        const g = games[i];
        if (pick[i]) g.pickUp();
        const inv = g.invByte();
        g.localTick(buttons[i], quantizeAim(0), (seq) => world.input(p.id, { seq, buttons: buttons[i], aim: quantizeAim(0), inv }));
      });
      world.step();
      inbox.forEach((box, i) => {
        for (const f of box.splice(0)) {
          const r = new Reader(f);
          r.u8();
          const tk = r.u32();
          const ack = r.u16();
          games[i].applyFrame(tk, ack, r);
        }
      });
    };
    for (let k = 0; k < 10; k++) tick([0, 0]);
    // The first climbs in, the second up on top.
    pick = [true, false];
    tick([0, 0]);
    pick = [false, false];
    tick([0, 0]);
    pick = [false, true];
    tick([0, 0]);
    pick = [false, false];
    tick([0, 0]);
    expect(ps[0].tank).toBe(0);
    expect(ps[1].surf).toBe(0);
    void invByte;

    for (let k = 0; k < 45; k++) {
      tick([BTN_RIGHT, 0]);
      const [driver, rider] = games;
      // (One instant for every view compared: render time otherwise moves on between the calls.)
      const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now());
      // The driver's screen: the rider on the predicted mole's seat.
      const dv = driver.tankViews(0.5).find((v) => v.slot === 0)!;
      const seen = driver.remoteViews(0.5).find((v) => v.id === ps[1].id)!;
      const s = surfSeat(dv, ps[1].seat, { x: 0, y: 0 });
      expect(seen.x).toBeCloseTo(s.x - ACTOR_W / 2, 6);
      expect(seen.y).toBeCloseTo(s.y - ACTOR_H, 6);
      expect(seen.moving).toBe(false);
      // The rider's own screen: itself on the seat of the mole as it draws it.
      const rv = rider.tankViews(0.5).find((v) => v.slot === 0)!;
      const me = rider.ridingAt(0.5)!;
      const s2 = surfSeat(rv, rider.surfSeatNo, { x: 0, y: 0 });
      expect(me.x).toBeCloseTo(s2.x - ACTOR_W / 2, 6);
      expect(me.y).toBeCloseTo(s2.y - ACTOR_H, 6);
      now.mockRestore();
    }
    // On its hull's top, not sunk into it: each seat's feet within a couple of cells of its roofline.
    const m = world.tanks[0]!;
    for (let i = 0; i < 3; i++) {
      const s = surfSeat(m, i, { x: 0, y: 0 });
      expect(s.y).toBeGreaterThanOrEqual(m.y);
      expect(s.y).toBeLessThan(m.y + 2.5);
    }
  });
});
