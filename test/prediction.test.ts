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
      // Authoritative body changes (respawn, a part torn off) legitimately
      // correct the prediction once each; count them.
      let bodyChanges = 0;
      let lastMask = -1;
      let wasAlive = false;
      let measuring = false;

      for (now = 0; now < 900; now++) {
        if (rng.next() < 0.08) {
          const r = rng.next();
          buttons = (r < 0.4 ? BTN_RIGHT : r < 0.8 ? BTN_LEFT : 0) | (rng.next() < 0.4 ? BTN_UP : 0);
        }
        const aim = quantizeAim(0);
        // Hands off the stick while riding in (piloting has its own test in
        // craft.test.ts): the autopilot lands, and we measure the clone.
        if (!p.alive) buttons = 0;
        game.localTick(buttons, aim, 0, (seq) => toServer.push({ at: now + latencyTicks, cmd: { seq, buttons, aim, weapon: 0 } }));
        while (toServer.length && toServer[0].at <= now) world.input(p.id, toServer.shift()!.cmd);
        world.step();
        // Measure steady state: from when the clone is down and its drop
        // rocket has left (rocket exhaust wind is an external, unpredicted force).
        if (!measuring && p.alive && world.crafts.every((c) => c === null)) {
          measuring = true;
          game.corrections = 0;
          bodyChanges = 0;
        }
        if (p.alive !== wasAlive || (p.alive && p.parts.mask !== lastMask)) bodyChanges++;
        wasAlive = p.alive;
        lastMask = p.parts.mask;
        while (toClient.length && toClient[0].at <= now) {
          const r = new Reader(toClient.shift()!.data);
          r.u8();
          const tick = r.u32();
          const ack = r.u16();
          game.applyFrame(tick, ack, r);
          if (game.alive) reconciles++;
        }
      }
      expect(measuring).toBe(true);
      expect(reconciles).toBeGreaterThan(300);
      // Steady state must not correct: only the first frames and real body
      // changes (spawn, death, a part torn off) may.
      expect(game.corrections).toBeLessThanOrEqual(1 + bodyChanges);
    });
  }
});
