import { describe, expect, it } from 'vitest';
import { BTN_LEFT, BTN_RIGHT, BTN_UP } from '../src/shared/actor.ts';
import { Reader } from '../src/shared/codec.ts';
import { quantizeAim } from '../src/shared/protocol.ts';
import { Rng } from '../src/shared/rng.ts';
import { World } from '../src/server/world.ts';
import { Game } from '../src/client/game.ts';

/**
 * Drive the real client Game against the real server World over a link with
 * symmetric latency, and check that the client's predicted movement agrees
 * with the authoritative result once it comes back.
 */
describe('client-side prediction', () => {
  for (const latencyTicks of [1, 4, 9]) {
    it(`replays unacknowledged inputs exactly at ${latencyTicks * 33}ms one-way latency`, () => {
      const world = new World(555);
      const game = new Game();
      const toClient: { at: number; data: Uint8Array }[] = [];
      const toServer: { at: number; cmd: Parameters<World['input']>[1] }[] = [];
      let now = 0;
      const p = world.addPlayer('pred', { send: (d) => toClient.push({ at: now + latencyTicks, data: d }) })!;
      game.myId = p.id;
      const rng = new Rng(9);
      let buttons = 0;
      let reconciles = 0;

      for (now = 0; now < 900; now++) {
        if (rng.next() < 0.08) {
          const r = rng.next();
          buttons = (r < 0.4 ? BTN_RIGHT : r < 0.8 ? BTN_LEFT : 0) | (rng.next() < 0.4 ? BTN_UP : 0);
        }
        const aim = quantizeAim(0);
        game.localTick(buttons, aim, 0, (seq) => toServer.push({ at: now + latencyTicks, cmd: { seq, buttons, aim, weapon: 0 } }));
        while (toServer.length && toServer[0].at <= now) world.input(p.id, toServer.shift()!.cmd);
        world.step();
        while (toClient.length && toClient[0].at <= now) {
          const r = new Reader(toClient.shift()!.data);
          r.u8();
          const tick = r.u32();
          const ack = r.u16();
          game.applyFrame(tick, ack, r);
          if (game.alive) reconciles++;
        }
      }
      expect(reconciles).toBeGreaterThan(500);
      // Spawn and the first frames after it may correct; steady state must not.
      expect(game.corrections).toBeLessThanOrEqual(2);
    });
  }
});
